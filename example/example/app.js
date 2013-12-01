
/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
var user = require('./routes/user');
var http = require('http');
var path = require('path');


var app = express();

// Requiring important modules
var tingo = require("tingodb")({}); // TingoDB

var JsonRestStores = require('jsonreststores'); // The main JsonRestStores module

var SimpleSchema = require('simpleschema');  // The schema module (main + tingo)
var SimpleSchemaTingo = require('simpleschema-tingo');

var SimpleDbLayer = require('simpledblayer'); // The DB layer (main + tingo)
var SimpleDbLayerTingo = require('simpledblayer-tingo');

var declare = require('simpledeclare'); // Declare module

// Defining important variables

// Db Object from Tingo
var db = new tingo.Db('/tmp/tests', {} );


// Layer class, mixing in SimpleDbLayer and SimpleDbLayerTingo
var DbLayer = declare( [ SimpleDbLayer, SimpleDbLayerTingo ], { db: db } );
var JRS = declare( JsonRestStores, { DbDriver: DbLayer } );
var Schema = declare( [ SimpleSchema, SimpleSchemaTingo ] );

var People = declare( JRS, {

  schema: new Schema({
    id     : { type: 'id' },
    name   : { type: 'string', trim: 60 },
    surname: { type: 'string', trim: 60 },
  }),

  paramIds: [ 'id' ],
  storeName: 'People',

  handlePut: true,
  handlePost: true,
  handleGet: true,
  handleGetQuery: true,
  handleDelete: true,

});
People.onlineAll( app, '/users/', ':id' );


// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', routes.index);
app.get('/users', user.list);

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
