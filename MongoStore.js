
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

  constructor: function(){
    
    // This.collectionName will default to the store's name if not set
    this.collectionName = this.collectionName ? this.collectionName : this.storeName;
    this.collection = db.collection( this.collectionName );
  },

  collectionName: null,

  extrapolateDoc: function( fullDoc ){
    return this.inherited(arguments);
  },

  prepareBeforeSend: function( doc, cb ){
    var doc = {};
    cb( null, doc );
  },

  allDbFetch: function( reqParams, cb ){

    if( this.paramIds.length !== 1 ) 
      return cb( new Error("Stock allDbFetch does not work when paramsIds > 1"), null );

    this.collection.findOne( {_id: ObjectId( reqParams[this.paramIds[0]] ) }, cb );

  }, 

  // TODO: Finish this one, implement a simple version. NOTE: this is the only
  // function that is actually responsible for actually sending data, because
  // the resultset could be huge

  getDbQuery: function( req, res, sortBy, ranges, filters ){
    // console.log(sortBy);
    // console.log(ranges);
    // console.log(filters);

    res.json( 200, [] );
  },

  postDbInsertNoId: function( req,  cb ){
    if( this.paramIds.length !== 1 ) 
      return cb( new Error("Stock postDbInsertNoId does not work when paramsIds > 1"), null );
   
    var self = this;

    req.body._id = ObjectId();
    this.collection.insert( req.body, function( err ){
      if( err ) {
        cb( err );
      } else {
        self.collection.findOne( {_id: req.body._id }, cb );
      }
    });

  },


  postDbUpdatePrefix: '',

  postDbUpdateMake: function( doc, exceptions ){
    var updateObject = {};

    // Simply copy values over with the prefix
    // (e.g. something.other.actualvalue1, etc.
    for( i in doc ){
      if( ! exceptions[ i ] ) updateObject[ this.postDbUpdatePrefix + i ] = doc[ i ];
      // updateObject[ this.postDbUpdatePrefix + i ] = doc[ i ];
    }

    // Return the actual update object 
    return { $set: updateObject };
  },

  putDbUpdate: function( req, cb ){

    if( this.paramIds.length !== 1 ) 
      return cb( new Error("Stock putDbUpdate does not work when paramsIds > 1"), null );
  
    var self = this;


    var updateObject = this.postDbUpdateMake( req.body, { '_id': true } );

    
    this.collection.findAndModify( { _id: req.body._id }, {}, updateObject, {new: true}, cb );
/*
    this.collection.update( { _id: req.body._id }, updateObject, function( err ){
      if( err ) {
        cb( err );
      } else {
        self.collection.findOne( {_id: req.body._id }, cb );
      }
    });*/
  },


  putDbInsert: function( req, cb ){
    if( this.paramIds.length !== 1 ) 
      return cb( new Error("Stock putDbInsert does not work when paramsIds > 1"), null );
  
    var self = this;

    this.collection.insert( req.body, function( err ){
      if( err ) {
        cb( err );
      } else {
        self.collection.findOne( {_id: req.body._id }, cb );
      }
    });

  },

  postDbAppend: function( req, doc, fullDoc, cb ){

    // Is this _ever_ implemented, really? Seriously?
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
