#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const SERVER_URL = "http://120.26.203.16/uploads";
const FILE_PATH = process.argv[2];

if (!FILE_PATH) {
  console.error("Usage: upload.js <file-path>");
  process.exit(1);
}

if (!fs.existsSync(FILE_PATH)) {
  console.error(`Error: File ${FILE_PATH} not found`);
  process.exit(1);
}

const fileName = path.basename(FILE_PATH);
const fileStream = fs.createReadStream(FILE_PATH);

// upload file
const uploadFile = () => {
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "multipart/form-data",
      "Transfer-Encoding": "chunked",
      Filename: fileName,
    },
  };

  console.log(`Uploading file "${fileName}" to ${SERVER_URL}...`);

  const req = https.request(SERVER_URL, options, (res) => {
    console.log(`Server response: ${res.statusCode}`);
    res.on("data", (data) => console.log(`Response data: ${data}`));
  });

  req.on("error", (err) => {
    console.error(`Error during upload: ${err.message}`);
  });

  fileStream.pipe(req);
};

// test network connecting and exec uploadFile
try {
  uploadFile();
} catch (error) {
  console.error("Error: Network is unavailable");
}
