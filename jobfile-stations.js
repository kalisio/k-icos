import _ from 'lodash'
import moment from 'moment'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbUrl = process.env.DB_URL || 'mongodb://127.0.0.1:27017/icos'
const specFilter = process.env.OBJECT_SPEC_FILTER || 'radon data'
const history =  +process.env.HISTORY || (1 * 24 * 60 * 60) // duration in seconds

export default {
  id: 'icos-stations',
  store: 'memory',
  options: {
    workersLimit: 1,
    faultTolerant: true,
  },
  tasks: [{
    id: 'stations',
    type: 'http',
    options: {
      url: 'https://meta.icos-cp.eu/sparql',
      method: 'POST',
      // This SPARQL request retrieve the latest data objects containing a specific label
      // Then it explore relationships to retrieve the associated station information
      body: `prefix cpmeta: <http://meta.icos-cp.eu/ontologies/cpmeta/>
            prefix prov: <http://www.w3.org/ns/prov#>
            prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>

            select (str(?submTime) as ?time) ?object ?spec ?fileName ?station ?stationId ?stationName ?latitude ?longitude ?altitude where{
              ?object cpmeta:hasObjectSpec ?specUri .
              ?object cpmeta:wasSubmittedBy/prov:endedAtTime ?submTime .
              ?object cpmeta:hasName ?fileName .
              ?object cpmeta:wasAcquiredBy ?acquisition .
              ?acquisition prov:wasAssociatedWith ?station .
              ?station cpmeta:hasLatitude ?latitude .
              ?station cpmeta:hasLongitude ?longitude .
              ?station cpmeta:hasElevation ?altitude .
              ?station cpmeta:hasStationId ?stationId .
              ?station cpmeta:hasName ?stationName .
              ?specUri rdfs:label ?spec .
              filter contains(?spec, "${specFilter}")
              filter (?submTime > "${moment.utc().subtract(history, 'seconds').format()}"^^xsd:dateTime)
            }
            order by desc(?submTime)`,
      type: 'JSON'
    }
  }],
  hooks: {
    tasks: {
      after: {
        readJson: {
          objectPath: 'results.bindings',
          transform: {
            mapping: {
              'longitude.value': 'longitude',
              'latitude.value': 'latitude',
              'altitude.value': 'altitude',
              'stationId.value': 'stationId',
              'stationName.value': 'stationName'
            },
            pick: ['longitude', 'latitude', 'altitude', 'stationId', 'stationName']
          }
        },
        convertToGeoJson: {
        },
        updateMongoCollection: {
          collection: 'icos-stations',
          filter: { 'properties.stationId': '<%= properties.stationId %>' },
          upsert: true,
          chunkSize: 256
        },
        clearData: {}
      }
    },
    jobs: {
      before: {
        createStores: [{
          id: 'memory'
        }, {
          id: 'fs', options: { path: __dirname }
        }],
        connectMongo: {
          url: dbUrl,
          // Required so that client is forwarded from job to tasks
          clientPath: 'taskTemplate.client'
        },
        createMongoCollection: {
          clientPath: 'taskTemplate.client',
          collection: 'icos-stations',
          indices: [
            [{ 'properties.stationId': 1 }, { unique: true }], 
            { geometry: '2dsphere' }
          ]
        }
      },
      after: {
        disconnectMongo: {
          clientPath: 'taskTemplate.client'
        },
        removeStores: [ 'memory', 'fs' ]
      },
      error: {
        disconnectMongo: {
          clientPath: 'taskTemplate.client'
        },
        removeStores: [ 'memory', 'fs' ]
      }
    }
  }
}
