require("isomorphic-fetch");

// external file configuration setup
var conf = require("nconf");
conf.argv()
    .env()
    .file('main', { file: 'config/main.json', search: true });

// Dropbox official javascript client setup
var Dropbox = require("dropbox").Dropbox;
var dbx = new Dropbox({accessToken: conf.get('accessToken')});

dbx.filesDownload({ path: conf.get('filePath') })
    .then(function(response) {
        var buff = new Buffer(response.fileBinary);
        var stringToWrite = "\nJust some sample text here...";
        uploadFile(Buffer.concat([buff, new Buffer(stringToWrite)]));    
  })
  .catch(function(error) {
    console.log(error);
  });


function uploadFile(fileContent) {
    dbx.filesUpload({
        contents: fileContent,
        path: conf.get('filePath'),
        mode: "overwrite"
    }).then(function(response) {
        console.log(JSON.stringify(response));
    }).catch(function(error) {
        console.log(JSON.stringify(error.response));
    });
}