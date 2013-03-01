
var 
  dummy
, Schema = require('simpleschema-mongo')
, declare = require('simpledeclare')
, Store = require('./Store')

, url = require('url')
, async = require('async')
, checkObjectId = require('mongowrapper').checkObjectId
, ObjectId = require('mongowrapper').ObjectId
;


var MongoStore = declare( Store,  {

  constructor: function( ){

    // This.collectionName will default to the store's name if not set
    this.collectionName = this.collectionName ? this.collectionName : this.storeName;
    this.collection = this.db.collection( this.collectionName );
  },

  collectionName: null,
  idProperty: '_id',
  db: null,

  handlePut: false,
  handlePost: false,
  handlePostAppend: false,
  handleGet: false,
  handleGetQuery: false,
  handleDelete: false,

  getDbPrepareBeforeSend: function( doc, cb ){
    cb( null, doc );
  },

  allDbFetch: function( req, cb ){

    if( this.paramIds.length !== 1 ) 
      return cb( new Error("Stock allDbFetch does not work when paramsIds > 1"), null );

    this.collection.findOne( {_id: req.params[this.paramIds[0]] }, cb );

  }, 

  filterType: '$and',

  getDbQuery: function( req, res, next, sortBy, ranges, filters ){

    var self = this;

    var cursor;
    var selector = {};
   
    this._queryEnrichFilters( filters ); 

    // Select according to selector
    selector = self._queryMakeSelector( filters );
    cursor = self.collection.find( selector );

    // Skipping/limiting according to ranges/limits
    if( ranges.rangeFrom != 0 )
      cursor.skip( ranges.rangeFrom );
    if( ranges.limit != 0 )
      cursor.limit( ranges.limit );

    cursor.count( function( err, total ){
      self._sendErrorOnErr( err, res, next, function(){

        self._querySetRangeHeaders( res, ranges, total );

        cursor.sort( self._queryMakeMongoSortArray( sortBy ) );        

        cursor.toArray( function( err, queryDocs ){
          self._sendErrorOnErr( err, res, next, function(){
       
            self._extrapolateAndPrepareAll( queryDocs, req, function( err ){ 
              self._sendErrorOnErr( err, res, next, function(){
                res.json( 200, queryDocs );
              })
            })

          }) // err
        }) // cursort.toArray

      }) // err
    }) // cursor.count 

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

  putDbUpdate: function( body, req, doc, fullDoc, cb ){

    if( this.paramIds.length !== 1 ) 
      return cb( new Error("Stock putDbUpdate does not work when paramsIds > 1"), null );
  

    var updateObject = this.postDbMakeUpdateObject( body, { '_id': true } );
    this.collection.findAndModify( { _id: fullDoc._id }, {}, updateObject, {new: true}, cb );
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
  _checkId: function( id ){ 
    return checkObjectId( id );
  },

  // Cast a string to its ObjectId equivalent
  _castId: function( id ){ 
    return checkObjectId( id ) ? ObjectId( id ) : id;
  },



  // Make up the query selector, respecting searchPartial for fields
  _queryMakeSelector: function( filters ){
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


});

MongoStore.Schema = Schema;
exports = module.exports = MongoStore;
