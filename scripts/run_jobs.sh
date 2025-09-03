#!/usr/bin/env bash
set -euo pipefail

# run stations jobs
krawler ./jobfile-stations.js
#run observations jobs 
krawler ./jobfile-observations.js