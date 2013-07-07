
var 
  dummy
, declare = require('simpledeclare')
, Store = require('jsonreststores')

, ObjectId = require('mongowrapper').ObjectId
;


var MongoDriverMixin = declare( null, {

  constructor: function(){
    // console.log("********************************************* CONSTRUCTOR: MongoDriverMixin");

    // This.collectionName will default to the store's name if not set
    this.collectionName = this.collectionName ? this.collectionName : this.storeName;
    this.collection = this.db.collection( this.collectionName );

  },


  collectionName: null,
  idProperty: null,
  db: null,

  handlePut: false,
  handlePost: false,
  handlePostAppend: false,
  handleGet: false,
  handleGetQuery: false,
  handleDelete: false,



  _makeMongoFilter: function( params ){
    var self = this;

    var filter = {};
    self.paramIds.forEach( function( paramId ){
      // if( ! self._ignoredId( paramId ) && typeof( params[ paramId ]) !== 'undefined' ){
      if( typeof( params[ paramId ]) !== 'undefined' ){
        filter[ paramId ] = params[ paramId ];
      }
    });
    return filter;
  },

  /*
  defaultParamIdsDef: function(){
    return { type: 'id', isRequired: true, searchable: true  };
  },
  */

  /*
  makeId: function( object, cb ){
    cb( null, ObjectId() );
  },
  */


  /*
  getDbPrepareBeforeSend: function( doc, cb ){
    cb( null, doc );
  },
  */


  driverAllDbFetch: function( params, body, options, cb ){

    var self = this;

    // Make up the filter, based on the store's IDs (used as filters).
    var filter = self._makeMongoFilter( params );
    this.collection.findOne( filter, self.schema.fieldsHash, cb );
  }, 

  driverPostDbInsertNoId: function( params, body, options, generatedId, cb ){
   
    var self = this;

    var record = {};

    // Make up the `record` variable, based on the passed `body`
    for( var k in body ) record[ k ] = body[ k ];
    self.paramIds.forEach( function( paramId ){
      if( typeof( params[ paramId ] ) !== 'undefined' ){
        record[ paramId ] = params[ paramId ];
      }
    });

    // The last parameter is missing since it
    // wasn't passed: assign an ObjectId to it
    record[ self.idProperty ] = generatedId;

    // Set the record ID to keep Mongo happy and make
    // subsequent search easier. 
    if( self.idProperty !== '_id' ) record._id  = ObjectId();

    // Insert the made up record
    self.collection.insert( record, function( err ){
      if( err ) {
        cb( err );
      } else {
        self.collection.findOne( { _id: record._id }, self.schema.fieldsHash, cb );
      }
    });

  },

  driverPutDbUpdate: function( params, body, options, doc, fullDoc, cb ){

    var self = this;
    var updateObject = {};

    // Make up the filter, based on the store's IDs (used as filters).
    var filter = self._makeMongoFilter( params );

    // Simply copy values over except self.idProperty (which mustn't be
    // overwritten)
    for( var i in body ){
      if( i != self.idProperty ) updateObject[ i ] = body[ i ];
    }

    self.collection.update( filter, { $set: updateObject }, function( err, doc ){
      if( err ){
        cb( err, null );
      } else {
        self.collection.findOne( filter, self.schema.fieldsHash, cb );
      }

    });
  },


  driverPutDbInsert: function( params, body, options, cb ){
  
    var self = this;

    var record = {};

    // Make up the `record` variable, based on the passed `body`
    for( var k in body ) record[ k ] = body[ k ];
    self.paramIds.forEach( function( paramId ){
      if( typeof( params[ paramId ] ) !== 'undefined' ){
        record[ paramId ] = params[ paramId ];
      }
    });

    // There is actually a chance that _id is not defined,
    // in case the store is using a different ID to the one
    // in the database.
    if( self.idProperty !== '_id' ) record._id  = ObjectId();

    this.collection.insert( record, function( err ){
      if( err ) {
        cb( err );
      } else {
        self.collection.findOne( {_id: record._id }, self.schema.fieldsHash, cb );
      }
    });

  },

  driverPostDbAppend: function( params, body, options, doc, fullDoc, cb ){

    // Is this _ever_ implemented, really? Seriously?
    cb( null, doc );
  },


  driverDeleteDbDo: function( params, body, options, cb ){

    var self = this;

    // Make up the filter
    var filter = self._makeMongoFilter( params );

    // Actually remove the field
    self.collection.remove( filter, function( err, doc ){
      if( err ) {
        cb( err );
      } else {
        cb( null );
      }
    });

  },

  driverGetDbQuery: function( params, body, options, next ){

    var self = this;

    var cursor;
    var selector = {};
   
    this._queryEnrichFilters( options.filters ); 

    // Select according to selector
    selector = self._queryMakeSelector( options.filters, params );
    cursor = self.collection.find( selector, self.schema.fieldsHash );

    // Skipping/limiting according to ranges/limits
    if( typeof( options.ranges) == 'object' && options.ranges != null ){
      if( options.ranges.rangeFrom != 0 )
        cursor.skip( options.ranges.rangeFrom );
      if( options.ranges.limit != 0 )
        cursor.limit( options.ranges.limit );
    }

    cursor.count( function( err, total ){
      self._sendErrorOnErr( err, next, function(){
        
        cursor.sort( self._queryMakeMongoSortArray( options.sortBy ) );        
        cursor.toArray( function( err, queryDocs ){
          self._sendErrorOnErr( err, next, function(){
            queryDocs.total = total;
            next( null, queryDocs );
          });
        });

      }) // err
    }) // cursor.count 

  },


  // Make up the query selector
  _queryMakeSelector: function( filters, params ){
    var selector, s;
    var item;
    var foundOne;


    // Make up the mongo selector based on the passed filter
    // The end result is either { $and: [ name: 'a'], [ surname: 'b'] } or
    // { $or: [ name: 'a'], [ surname: 'b'] }
    foundOne = false;
    selector = {};
    selector[ '$' + this.queryFilterType ] =  [];
    for( var k in filters ){
      item = {};
      item[ k ] = filters[ k ];
      selector[ '$' + this.queryFilterType ].push( item );
      foundOne = true;
    }

    // Make up the URL-based filter
    var urlFilter = this._makeMongoFilter( params );

    // No criteria found: just return the URL-based filter
    // and nothing else
    if( ! foundOne){
      return urlFilter;
    }

    // Add the criteria to the $and side of the selector
    if( this.queryFilterType !== 'and' ) selector[ '$and' ] = [];
    for( k in urlFilter ){
      item = {};
      item[ k ] = urlFilter[ k ];
      selector[ '$and' ].push( item );
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


  _queryMakeMongoSortArray: function( sortBy ){
    var sortArray = [];  

    for( var k in sortBy )
      sortArray.push( [ k , sortBy [ k ] ] );

    return sortArray;

  },

});


// "Inherit" the class function "make" so that modules using this don't have to
// use the "parent" module too
// NOTE: No longer needed, as simpledeclare now does this for us
// StoreMongo.make = Store.make;

// Get the default schema for the db
// StoreMongo.Schema = SchemaMongo;


exports = module.exports = MongoDriverMixin;
