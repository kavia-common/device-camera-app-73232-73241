#!/bin/bash
cd /home/kavia/workspace/code-generation/device-camera-app-73232-73241/camera_app_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

