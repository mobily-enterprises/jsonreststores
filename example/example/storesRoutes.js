// Requiring important modules
var tingo = require("tingodb")({}); // TingoDB

var declare = require('simpledeclare'); // Declare module

var JsonRestStores = require('jsonreststores'); // The main JsonRestStores module

var SimpleSchema = require('simpleschema');  // The schema module (main + tingo)
var SimpleSchemaTingo = require('simpleschema-tingo');

var SimpleDbLayer = require('simpledblayer'); // The DB layer (main + tingo)
var SimpleDbLayerTingo = require('simpledblayer-tingo');

// Db Object from Tingo
var db = new tingo.Db('/tmp/tests', {} );

exports = module.exports = function( app ){

  // Layer class: mixin of the base SimpleDbLayer and SimpleDbLayerTingo, with `db` property set
  var DbLayer = declare( [ SimpleDbLayer, SimpleDbLayerTingo ], { db: db } );

  // JsonRestStore class, created with the DbLayer we just created
  var JRS = declare( JsonRestStores, { DbLayer: DbLayer } );

  // Schema class: mixin of the base SimpleSchema class and SimpleSchemaTingo
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

    hardLimitOnQueries: 50,
  });

  People.onlineAll( app, '/users/', ':id' );
}
