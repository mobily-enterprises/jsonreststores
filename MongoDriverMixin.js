/*
Copyright (C) <year> <copyright holders>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var 
  dummy
, declare = require('simpledeclare')
, Store = require('jsonreststores')

, ObjectId = require('mongowrapper').ObjectId
;


var MongoDriverMixin = declare( null, {

  constructor: function(){

    this.projectionHash = {};

    // Just because I went insane figuring this out, and want to save the hassle to
    // more people in the future
    if( !this.db ){
      throw new Error("The 'db' attribute MUST be specified for MongoDriverMixin" );
    }

    // This.collectionName will default to the store's name if not set
    this.collectionName = this.collectionName ? this.collectionName : this.storeName;
    this.collection = this.db.collection( this.collectionName );

    // Make sure that I have `_id: false` in the projection hash (used in all finds)
    // if `_id` is not explicitely defined in the schema.
    // in "inclusive projections" in mongoDb, _id is added automatically and it needs to be
    // explicitely excluded (it is, in fact, the ONLY field that can be excluded in an inclusive projection)
    for( var k in this.schema.fieldsHash ) this.projectionHash[ k ] = this.schema.fieldsHash[ k ];
    if( typeof( this.schema.fieldsHash._id ) === 'undefined' ) this.projectionHash._id =false ;

  },

  collectionName: null,
  db: null,

  handlePut: false,
  handlePost: false,
  handlePostAppend: false,
  handleGet: false,
  handleGetQuery: false,
  handleDelete: false,

  _mongoFilterFromParams: function( params ){
    var self = this;

    var filter = {};
    self.paramIds.forEach( function( paramId ){
      if( typeof( params[ paramId ]) !== 'undefined' ){
        filter[ paramId ] = params[ paramId ];
      }
    });
    return filter;
  },


  driverAllDbFetch: function( params, body, options, cb ){

    var self = this;

    // Make up the filter, based on the store's IDs (used as filters).
    var filter = self._mongoFilterFromParams( params );

    this.collection.findOne( filter, self.projectionHash, cb );
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
        self.collection.findOne( { _id: record._id }, self.projectionHash, cb );
      }
    });

  },

  driverPutDbUpdate: function( params, body, options, doc, fullDoc, cb ){

    var self = this;
    var updateObject = {}, unsetObject = {};

    // Make up the filter, based on the store's IDs (used as filters).
    var filter = self._mongoFilterFromParams( params );

    // Simply copy values over except self.idProperty (which mustn't be
    // overwritten)
    for( var i in body ){
      if( i != self.idProperty ) updateObject[ i ] = body[ i ];
    }

    // Unset any value that is not actually set but IS in the schema,
    // so that partial PUTs will "overwrite" whole objects rather than
    // just overwriting fields that are _actually_ present in `body`
    for( var i in self.schema.structure ){
       if( typeof( body[ i ] ) === 'undefined' ) unsetObject[ i ] = 1;
    }

    self.collection.update( filter, { $set: updateObject, $unset: unsetObject }, function( err, doc ){
      if( err ){
        cb( err, null );
      } else {
        self.collection.findOne( filter, self.projectionHash, cb );
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
        self.collection.findOne( {_id: record._id }, self.schema.projectionHash, cb );
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
    var filter = self._mongoFilterFromParams( params );

    // Actually remove the field
    self.collection.remove( filter, function( err, doc ){
      if( err ) {
        cb( err );
      } else {
        cb( null );
      }
    });

  },


  // THE FOLLOWING API FUNCTIONS ARE NOT CALLABLE FROM AN ONLINE API


  driverMassDeleteDbDo: function( params, body, options, cb ){
    var selector = {};
   
    var self = this;

   
    // Make up the selector based on the query
    selector = self._queryMakeSelector( options.queryFilterType, options.filters, options.searchPartial, {} );

    // Paranoid check. Important since an empty selector WILL lead
    // to table zapping...
    if( Object.keys( selector ).length == 0 && ! options.allowZapping ){
      cb( new Error("Zapping of table not allowed, mass deletion aborted" ) );
    } else {

      // Actually remove the field
      self.collection.remove( selector, function( err, howMany ){
        if( err ) {
          cb( err );
        } else {
          cb( null, howMany );
        }
      });
    }
  },

  

  driverGetDbQuery: function( params, body, options, next ){

    var self = this;

    var cursor;
    var selector = {};

    // FIXME: This function has the ugly side effect of actually changing `options.filters`,
    // change it so that it doesn't. Make sure a `mongoFilter` object is created and then
    // used for queryMakeSelector() without side effects
    // this._queryEnrichFilters( options.filters, options.searchPartial ); 

    // Select according to selector
    selector = self._queryMakeSelector( options.queryFilterType, options.filters, options.searchPartial, params );
    cursor = self.collection.find( selector, self.projectionHash );

    if( typeof( options.ranges) == 'object' && typeof( options.ranges) === 'object' && options.ranges !== null ){

      // If `rangeFrom` and `rangeTo` are set, and limit isn't, then `limit`
      // needs to be set
      if( options.ranges.rangeFrom != 0 && options.ranges.rangeTo != 0 && typeof( options.ranges.limit ) === 'undefined' ){
         options.ranges.limit =  options.ranges.rangeTo - options.ranges.rangeFrom + 1;
      }

      // If `limit` makes it go over `rangeTo`, then resize `limit`
      if( options.ranges.rangeFrom + options.ranges.limit > options.ranges.rangeTo ){
        options.ranges.limit =  options.ranges.rangeTo - options.ranges.rangeFrom + 1;
      }
  
      // Respect hard limit on number of returned records
      if( options.ranges.limit > self.hardLimitOnQueries ){
        options.ranges.limit = self.hardLimitOnQueries;
      }
   
 
      // Skipping/limiting according to ranges/limits
      if( options.ranges.rangeFrom != 0 )
        cursor.skip( options.ranges.rangeFrom );
      if( options.ranges.limit != 0 )
        cursor.limit( options.ranges.limit );
    }

    // Sort the results
    cursor.sort( self._queryMakeMongoSortArray( options.sortBy ), function( err ){
      self._sendErrorOnErr( err, next, function(){



        if( ! options.cursor ){

          cursor.count( function( err, total ){
            self._sendErrorOnErr( err, next, function(){
       
              cursor.toArray( function( err, queryDocs ){
                self._sendErrorOnErr( err, next, function(){

                  // Remove resultsSet if so required
                  if( options.remove ){
                    // Silent failing
                    self.collection.remove( selector, function( err, doc ){ } );
                  }
                  queryDocs.total = total;
                  next( null, queryDocs );
                });
              });
            });
          });

        } else {

          var o = {};


          o.next = function( cb ){
            cursor.nextObject( cb );
            // TODO: Check options.remove, remove data as it's fetched

          }

          o.rewind = function( cb ){
            cursor.rewind();
            cb( null );
          }
          o.close = function( cb ){
            cursor.close( cb );
          }

          next( null, o );
        }

      }) // err
    }) // cursor.sort

  },


  // Make up the query selector
  _queryMakeSelector: function( queryFilterType, filters, searchPartial, params ){
    var selector;
    var item;
    var self = this;

    // Set a sane, safe default for queryFilterType
    if( queryFilterType !== 'and' && queryFilterType !== 'or' ) queryFilterType = 'and';

    // Set a sane, safe default for searchPartial
    if( typeof( searchPartial ) !== 'object' || searchPartial === null ) searchPartial = {};

    // CASE #1: If there are no filters, then just return the
    // default urlFilter based on params

    if( typeof( filters ) !== 'object' || Object.keys( filters ).length == 0 ){
      return this._mongoFilterFromParams( params );
    }


    // CASE #2: there are filters. So, the query will be based on BOTH the
    // params passed, _and_ the filters


    // Prepare the selector variable for $and and $or arrays
    // $or is only needed if the queryType is 'or'
    selector = {};
    selector[ '$and' ] =  [];
    selector[ '$or' ] =  [];

    // First of all, make up the params filter...
    var paramsFilter = this._mongoFilterFromParams( params );

    // ...and add the criteria to the $and side of the selector
    for( var k in paramsFilter ){
      item = {};
      item[ k ] = paramsFilter[ k ];
      selector[ '$and' ].push( item );
    }

    // Add filters to the selector
    for( var k in filters ){
      item = {};

      // Check if it's a filterType field -- if it is, add the correct filter type
      // if( typeof( self.searchSchema.structure[ k ] ) === 'object' && self.searchSchema.structure[ k ] !== null ){
      
      if( self.searchSchema.structure[ k ].filterType ){
        var filterType = self.searchSchema.structure[ k ].filterType;

        switch( filterType.type ){

          // "range" type of filter: check direction and reference field
          case 'range':

            // Double check that the referenced field exists
            if( typeof( self.searchSchema.structure[ filterType.field ] ) === 'undefined' ){
              throw( new Error('"field" option in filter type is undefined: ' + filterType.field  ) );
            }

            // Adding the right filter, depending of 'direction' being 'from' or 'to'
            if( filterType.direction == 'from' ){
              item[ filterType.field ] = { $gte: filters[ k ] } ; 
            } else {
              item[ filterType.field ] = { $lte: filters[ k ] } ; 
            }

          break;
        }


      } else {

        // If searchPartial is requested, then have it as a regular expression
        if( searchPartial[ k ] ){
          item[ k ] = { $regex: new RegExp('^' + filters[ k ] + '.*' ) };
        } else {
          item[ k ] = filters[ k ];
        }
      }

      // Finally adding the item
      selector[ '$' + queryFilterType ].push( item );
    }

    // Clean up selector, as Mongo doesn't like empty arrays for selectors
    if( selector[ '$and' ].length == 0 ) delete selector[ '$and' ];
    if( selector[ '$or' ].length == 0 ) delete selector[ '$or' ];


 
    return selector;
    
  },

  _queryMakeMongoSortArray: function( sortBy ){
    return sortBy;

    /*
    var sortArray = [];  

    for( var k in sortBy )
      sortArray.push( [ k , sortBy [ k ] ] );

    return sortArray;
    */

  },

});


// "Inherit" the class function "make" so that modules using this don't have to
// use the "parent" module too
// NOTE: No longer needed, as simpledeclare now does this for us
// StoreMongo.make = Store.make;

// Get the default schema for the db
// StoreMongo.Schema = SchemaMongo;


exports = module.exports = MongoDriverMixin;
