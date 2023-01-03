# k-icos

[![Latest Release](https://img.shields.io/github/v/tag/kalisio/k-icos?sort=semver&label=latest)](https://github.com/kalisio/k-icos/releases)
[![Build Status](https://app.travis-ci.com/kalisio/k-icos.svg?branch=master)](https://app.travis-ci.com/kalisio/k-icos)

A [Krawler](https://kalisio.github.io/krawler/) based service to download atmospheric data from the French gelectrical network operated by RTE.

## Description

The **k-icos** job allow to scrape atmospheric data from the [RTE API]. The downloaded data are stored within a [MongoDB](https://www.mongodb.com/) database and more precisely in 2 collections:
* the `icos-observations` collection stores the observation data
* the `icos-stations` collection stores the station positions

All records are stored in [GeoJson](https://fr.wikipedia.org/wiki/GeoJSON) format.

The project consists in 2 jobs:
* the `stations` job scrapes the available stations according a specific cron expression. By default, every day at midnight.
* the `observations` job scrapes the observations data according a specific cron expression. By default every hour.

## Configuration

### Stations

| Variable | Description |
|--- | --- |
| `DB_URL` | The database URL. The default value is `mongodb://127.0.0.1:27017/icos` |
| `OBJECT_SPEC_FILTER` | A filter used to select only latest data objects containing this pattern. The default value is `radon` |
| `HISTORY` | The duration of the observations data history the job has to download. It must be expressed in seconds and the default value is `86 400 000` (1 day) | 
| `DEBUG` | Enables debug output. Set it to `krawler*` to enable full output. By default it is undefined. |

### Observations

| Variable | Description |
|--- | --- |
| `DB_URL` | The database URL. The default value is `mongodb://127.0.0.1:27017/icos` |
| `TTL` | The observations data time to live. It must be expressed in seconds and the default value is `604 800` (7 days) |
| `OBJECT_SPEC_FILTER` | A filter used to select only latest data objects containing this pattern. The default value is `radon` |
| `OBJECT_VARIABLE` | The name of the variable contained in the corresponding data objects. The default value is `rn` |
| `HISTORY` | The duration of the observations data history the job has to download. It must be expressed in seconds and the default value is `86 400 000` (1 day) | 
| `DEBUG` | Enables debug output. Set it to `krawler*` to enable full output. By default it is undefined. |

## Deployment

We personally use [Kargo](https://kalisio.github.io/kargo/) to deploy the service.

## Contributing

Please refer to [contribution section](./CONTRIBUTING.md) for more details.

## Authors

This project is sponsored by 

![Kalisio](https://s3.eu-central-1.amazonaws.com/kalisioscope/kalisio/kalisio-logo-black-256x84.png)
![IRSN](https://s3.eu-central-1.amazonaws.com/kalisioscope/assets/logos/irsn.png)

## License

This project is licensed under the MIT License - see the [license file](./LICENSE) for details