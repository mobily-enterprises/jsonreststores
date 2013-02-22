
var 
  dummy
, SimpleSchema = require('./SimpleSchema')
, declare = require('./declare')
, Store = require('./Store')
, e = require('./Errors')

, url = require('url')
, async = require('async')
, checkObjectId = require('mongoWrapper').checkObjectId
, ObjectId = require('mongoWrapper').ObjectId
;


var Schema = declare( SimpleSchema, {

  // Cast an ID for this particular engine. If the object is in invalid format, it won't
  // get cast, and as a result check will fail
  idTypeCast: function( definition, value ){
    if( checkObjectId( value ) ) {
      return ObjectId( value );
    } else {
      return value;
    }
  },
  // Check if an ID is legal for this particular engine
  idTypeCheck: function( definition, name, value, errors ){ 
    if( value.constructor.name !== 'ObjectID' ){
      errors.push( { field: name, message: 'Id not valid: ' + name } );
    }
  },

  constructor: function( ){
    console.log("**************Constructor for MongoSchema's schema called!");
  }

});


var MongoStore = declare( Store,  {

  collectionName: null,

  extrapolateDoc: function( fullDoc ){
    var doc = {};
    for( var k in fullDoc ) doc[ k ] = fullDoc[ k ];
    return doc;
  },

  prepareBeforeSend: function( doc, cb ){
    var doc = {};
    cb( null, doc );
  },

  allDbFetch: function( reqParams, cb ){
    var doc = {}
    cb( null, doc );
  }, 

  getDbQuery: function( req, res, sortBy, ranges, filters ){
    // console.log(sortBy);
    // console.log(ranges);
    // console.log(filters);

    res.json( 200, [] );
  },

  putDbInsert: function( req, doc, fullDoc, cb ){
    cb( null, doc );
  },

  putDbUpdate: function( req, doc, fullDoc, cb ){
    cb( null, doc );
  },

  postDbInsertNoId: function( req, cb ){
    var doc = {}
    cb( null, doc );
  },

  postDbAppend: function( req, doc, fullDoc, cb ){
    cb( null, doc );
  },

  deleteDbDo: function( id, cb ){
    cb( null );
  },

  // Check if an ID is legal for this particular engine
  checkId: function( id ){ 
    return checkObjectId( id );
  },

  // Cast an ID for this particular engine
  castId: function( id ){
    return ObjectId( id );
  }

});

MongoStore.Schema = Schema;
exports = module.exports = MongoStore;
