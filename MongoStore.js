
var 
  dummy
, SimpleSchema = require('./SimpleSchema')
, declare = require('simpledeclare')
, Store = require('./Store')

, url = require('url')
, async = require('async')
, checkObjectId = require('mongowrapper').checkObjectId
, ObjectId = require('mongowrapper').ObjectId
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

  getDbPrepareBeforeSend: function( doc, cb ){
    var doc = {};
    cb( null, doc );
  },


  allDbFetch: function( reqParams, cb ){

    if( this.paramIds.length !== 1 ) 
      return cb( new Error("Stock allDbFetch does not work when paramsIds > 1"), null );

    this.collection.findOne( {_id: ObjectId( reqParams[this.paramIds[0]] ) }, cb );

  }, 

  filterType: '$and',

  // Make up the query selector, respecting searchPartial for fields
  queryMakeSelector: function( filters ){
    var selector, s;
    var item;
    
    selector = {};
    selector[ this.filterType ] = s = [];
    for( var k in filters ){
      item = new Object();
      item[ k ] = filters [ k ];
      s.push( item );
    }
    return selector;
  },

  getDbQuery: function( req, res, sortBy, ranges, filters ){

    var self = this;

    var cursor;
    var selector = {};
   
    this._queryEnrichFilters( filters ); 

    // Select according to selector
    selector = this.queryMakeSelector( filters );
    cursor = this.collection.find( selector );

    // Skipping/limiting according to ranges/limits
    if( ranges.rangeFrom != 0 )
      cursor.skip( ranges.rangeFrom );
    if( ranges.limit != 0 )
      cursor.limit( ranges.limit );

    cursor.count( function( err, total ){
      if( err ){
        self._sendError( res, err );
      } else {

        self._querySetRangeHeaders( res, ranges, total );

        cursor.sort( self._queryMakeMongoSortArray( sortBy ) );        
        cursor.toArray( function( err, docs ){
          if( err ){
            self._sendError( res, err );
          } else {
          
            var docList = []; 
            docs.forEach( function( fullDoc ){

              console.log( fullDoc );

              var doc = self.extrapolateDoc( fullDoc );
              // TODO: run these as well
              // self.getDbPrepareBeforeSend( doc, function( err, doc ){
              docList.push( doc );

            })
            res.json( 200, docList );
          }
        });
      }
    });
  },

  postDbInsertNoId: function( body, req,  cb ){
    if( this.paramIds.length !== 1 ) 
      return cb( new Error("Stock postDbInsertNoId does not work when paramsIds > 1"), null );
   
    var self = this;

    body._id = ObjectId();
    this.collection.insert( body, function( err ){
      if( err ) {
        cb( err );
      } else {
        self.collection.findOne( {_id: body._id }, cb );
      }
    });

  },


  postDbUpdatePrefix: '',

  postDbMakeUpdateObject: function( doc, exceptions ){
    var updateObject = {};

    // Simply copy values over with the prefix (e.g. something.other.actualvalue1, etc.)
    // Honour the exceptions hash, as you don't want to update the primary key
    for( i in doc ){
      if( ! exceptions[ i ] ) updateObject[ this.postDbUpdatePrefix + i ] = doc[ i ];
    }

    // Return the actual update object 
    return { $set: updateObject };
  },

  putDbUpdate: function( body, req, cb ){

    if( this.paramIds.length !== 1 ) 
      return cb( new Error("Stock putDbUpdate does not work when paramsIds > 1"), null );
  
    var self = this;


    var updateObject = this.postDbMakeUpdateObject( body, { '_id': true } );

    
    this.collection.findAndModify( { _id: body._id }, {}, updateObject, {new: true}, cb );
  },


  putDbInsert: function( body, req, cb ){
    if( this.paramIds.length !== 1 ) 
      return cb( new Error("Stock putDbInsert does not work when paramsIds > 1"), null );
  
    var self = this;

    this.collection.insert( body, function( err ){
      if( err ) {
        cb( err );
      } else {
        self.collection.findOne( {_id: body._id }, cb );
      }
    });

  },

  postDbAppend: function( body, req, doc, fullDoc, cb ){

    // Is this _ever_ implemented, really? Seriously?
    cb( null, doc );
  },

  deleteDbDo: function( id, cb ){
    cb( null );
  },

  // Check if an ID is legal for this particular engine
  allDbCheckId: function( id ){ 
    return checkObjectId( id );
  },




  _queryEnrichFilters: function( filters ){

    var self = this;    

    for( var k in filters ){

      // They are marked as searchPartial: turn the string into a regexp
      if( self.schema.structure[ k ].searchPartial ){
        filters[ k ] = { $regex: new RegExp('^' + filters[ k ] + '.*' ) };
      }

      // ... anything else?

    }
  },


  _querySetRangeHeaders: function( res, ranges, total ){
    res.setHeader('Content-Range', 'items ' + ranges.rangeFrom + '-' + ranges.rangeTo + '/' + total );
  },

  _queryMakeMongoSortArray: function( sortBy ){
    var sortArray = [];  

    for( var k in sortBy )
      sortArray.push( [ k , sortBy [ k ] ] );

    return sortArray;

  },



  /*
  // Cast an ID for this particular engine
  castId: function( id ){
    return ObjectId( id );
  }
  */

});

MongoStore.Schema = Schema;
exports = module.exports = MongoStore;
