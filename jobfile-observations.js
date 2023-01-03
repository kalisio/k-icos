import _ from 'lodash'
import moment from 'moment'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const dbUrl = process.env.DB_URL || 'mongodb://127.0.0.1:27017/icos'
const ttl = +process.env.TTL || (7 * 24 * 60 * 60)  // duration in seconds
const history =  parseInt(process.env.HISTORY) || (1 * 24 * 60 * 60) // duration in seconds
const specFilter = process.env.OBJECT_SPEC_FILTER || 'radon'
const variable = process.env.OBJECT_VARIABLE || 'rn'
const startTime = moment.utc().subtract(history, 'seconds')

export default {
  id: 'icos-observations',
  store: 'fs',
  options: {
    workersLimit: 1
  },
  taskTemplate: {
    // Default file name is raw data (eg as zip) instead of CSV, update to avois any confusion
    id: `<%= fileName.replace('.zip', '.csv') %>`,
    type: 'http',
    options: {
      // URL to download objects directly as CSV is slightly different from raw data (eg as zip)
      // See https://github.com/ICOS-Carbon-Portal/data#csv-download-for-tabular-time-series-data
      url: `<%= objectUrl.replace('meta.icos-cp.eu/objects', 'data.icos-cp.eu/csv') %>`,
      auth: {
        url: 'https://cpauth.icos-cp.eu/password/login',
        form: {
          mail: process.env.USER_EMAIL,
          password: process.env.USER_PASSWORD
        }
      }
    }
  },
  hooks: {
    tasks: {
      before: {
        createMongoAggregation: {
          dataPath: 'data.mostRecentData',
          collection: 'icos-observations',
          pipeline: [
            {
              $match: {
                'properties.samplingHeight': '<%= samplingHeight %>',
                'properties.stationId': '<%= stationId %>',
                [`properties.${variable}`]: { $exists: true }
              }
            },
            { $sort: { time: -1 } },
            { $limit : 1 },
            {
              $group: {
                _id: "$properties.stationId",
                time: { $first: "$time" }
              }
            }
          ],
          allowDiskUse: true
        }
      },
      after: {
        readCSV: {
          headers: true
        },
        apply: {
          function: (item) => {
            const { longitude, latitude, altitude, samplingHeight, stationId, stationName, data } = item
            const latestData = _.get(item, 'mostRecentData[0]')
            let features = []
            _.forEach(data, (record) => {
              const time = moment.utc(record.TIMESTAMP)
              // Check if newer
              if (latestData && time.isSameOrBefore(moment.utc(latestData.time))) return
              // If so push it
              features.push({
                time: time.toDate(),
                level: samplingHeight,
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [longitude, latitude, altitude + samplingHeight]
                },
                properties: {
                  stationId,
                  stationName,
                  samplingHeight,
                  [variable]: _.toNumber(record[variable])
                }
              })
            })
            if (features.length > 0) console.log('Found ' + features.length + ' new observation data for station ' + stationId)
            else console.log('No new observation data found for station ' + stationId)
            item.data = features
          }
        },
        writeMongoCollection: {
          collection: 'icos-observations',
          chunkSize: 256
        },
        clearOutputs: {}
      }
    },
    jobs: {
      before: {
        basicAuth: { jar: true, optionsPath: 'taskTemplate.options' }, // Set cookie
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
          collection: 'icos-observations',
          indices: [
            { 'properties.stationId': 1 },
            { 'properties.stationId': 1, time: -1 },
            [{ time: 1 }, { expireAfterSeconds: ttl }], // days in s
            { geometry: '2dsphere' }                                                                                                              
          ],
        },
        runTask: {
          store: 'memory',
          id: 'data-objects',
          type: 'http',
          options: {
            url: 'https://meta.icos-cp.eu/sparql',
            method: 'POST',
            // This SPARQL request retrieve the latest data objects containing a specific label
            // Then it explore relationships to retrieve the associated station information
            body: `prefix cpmeta: <http://meta.icos-cp.eu/ontologies/cpmeta/>
                  prefix prov: <http://www.w3.org/ns/prov#>
                  prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>

                  select (str(?submTime) as ?time) ?object ?spec ?fileName ?station ?samplingHeight ?stationId ?stationName ?latitude ?longitude ?altitude where{
                    ?object cpmeta:hasObjectSpec ?specUri .
                    ?object cpmeta:wasSubmittedBy/prov:endedAtTime ?submTime .
                    ?object cpmeta:hasName ?fileName .
                    ?object cpmeta:wasAcquiredBy ?acquisition .
                    ?acquisition prov:wasAssociatedWith ?station .
                    ?acquisition cpmeta:hasSamplingHeight ?samplingHeight .
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
        },
        readJson: {
          store: 'memory',
          key: 'data-objects',
          objectPath: 'results.bindings',
          transform: {
            mapping: {
              'object.value': 'objectUrl',
              'fileName.value': 'fileName',
              'longitude.value': 'longitude',
              'latitude.value': 'latitude',
              'altitude.value': 'altitude',
              'samplingHeight.value': 'samplingHeight',
              'stationId.value': 'stationId',
              'stationName.value': 'stationName'
            },
            unitMapping: {
              longitude: { asNumber: true },
              latitude: { asNumber: true },
              altitude: { asNumber: true },
              samplingHeight: { asNumber: true }
            },
            pick: ['objectUrl', 'fileName', 'longitude', 'latitude', 'altitude', 'samplingHeight', 'stationId', 'stationName']
          },
          // Generate a download task per data object
          dataPath: 'data.tasks'
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
