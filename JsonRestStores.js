/*
Copyright (C) 2013 Tony Mobily

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/


/*

Out of curiosity, bugs found after VERY thorough unit testing:

* afterPutExisting wasn't called for LOCAL API requests
* on a PUT UPDATE, the record returned via remote call (as a JSON string) was the object BEFORE extrapolateDoc()
* prepareBodyPut was split in prepareBodyPutNew and prepareBodyPutExisting, which is logically wrong (prepareBody needed to happen at the very beginning)
* handleDelete was not taken into consideration at all

Funnily enough, it didn't catch a bug as big as the sky with the Range headers returning the wrong information (partial counts of objects) and not dealing with an important special case (zero results) 

*/


/*

Conversion to new db layer:


JSONRESTSTORES:

* [ X ] _castDoc in JsonRestStores is no longer useful, as it's already all done at schema level

* Change constructor. A layer needs:
  - Schema (passed by JsonRestStores, taken from its params)
  - idProperty (passed by JsonRestStores, taken from idParams)
  - Nested (passed by JsonRestStores, taken from its params)
  - positionField and positionBase (passed only if "position" is true, positionField fixed as __position and positionBase depending on idParams)
  - SchemaError (fixed)

* Implement searchSchema, which can be EXACTLY as it is. But, it needs searchableOption, which is only used if searchable is true.


*/


var 
  dummy
, e = require('allhttperrors')
, declare = require('simpledeclare')
, Schema = require('simpleschema')
, url = require('url')
, async = require('async')
;


var Store = declare( null,  {

  // ****************************************************
  // *** ATTRIBUTES THAT NEED TO BE DEFINED IN PROTOTYPE
  // ****************************************************

  paramIds: null,
  schema: null,
  storeName: null, // Must be defined in prototype

  // ****************************************************
  // *** ATTRIBUTES THAT CAN TO BE DEFINED IN PROTOTYPE
  // ****************************************************

  DbLayer: null, // If not set in prototype, NEEDS to be passed as the constructor parameter
  searchSchema: null, // If not set in prototype, is set as `schema` by constructor
  //collectionName: null, // If not set in prototype, is set as `storeName` by constructor

  // ****************************************************
  // *** ATTRIBUTES THAT DEFINE STORE'S BEHAVIOUR
  // ****************************************************

  handlePut: false,
  handlePost: false,
  handleGet: false,
  handleGetQuery: false,
  handleDelete: false,

  echoAfterPutNew: true,
  echoAfterPutExisting: true,
  echoAfterPost: true,

  chainErrors: 'none',  // can be 'none', 'all', 'nonhttp'

  hardLimitOnQueries: 50,
  deleteAfterGetQuery: false,

  strictSchemaAfterRefetching: false,


  nested: null,
  position: false,

  // ****************************************************
  // *** FUNCTIONS THAT CAN BE OVERRIDDEN BY DEVELOPERS
  // ****************************************************

  // Doc extrapolation calls
  extrapolateDoc: function( params, body, options, fullDoc, cb ){ cb( null, fullDoc ); },
  prepareBeforeSend: function( doc, cb ){ cb( null, doc ); },

  // "after" calls
  afterPutNew: function( params, body, options, doc, fullDoc, overwrite, cb ){ cb( null ) },
  afterPutExisting: function( params, body, options, doc, fullDoc, docAfter, fullDocAfter, overwrite, cb ){ cb( null ) },
  afterPost: function( params, body, options, doc, fullDoc, cb){ cb( null ); },
  afterDelete: function( params, body, options, doc, fullDoc, cb ){ cb( null ); },
  afterGet: function( params, body, options, doc, fullDoc, cb ) { cb( null ); },
  afterGetQuery: function( params, body, options, queryDocs, cb ) { cb( null ); },

  // Permission stock functions
  checkPermissionsPost: function( params, body, options, cb ){ cb( null, true ); },
  checkPermissionsPutNew: function( params, body, options, cb ){ cb( null, true ); },
  checkPermissionsPutExisting: function( params, body, options, doc, fullDoc, cb ){ cb( null, true ); },
  checkPermissionsGet: function( params, body, options, doc, fullDoc, cb ){ cb( null, true ); },
  checkPermissionsGetQuery: function( params, body, options, cb ){ cb( null, true ); },
  checkPermissionsDelete: function( params, body, options, doc, fullDoc, cb ){ cb( null, true ); },

  // Body preparation and postvalidation functions
  prepareBody: function( body, method, cb ){ cb( null, body ); },
  postValidate: function( body, method, cb ){ cb( null ); },

  logError: function( error ){  },

  formatErrorResponse: function( error ){

    if( error.errors ){
      return { message: error.message, errors: error.errors }
    } else {
      return { message: error.message }
    }
  },


  // **************************************************************************
  // *** END OF FUNCTIONS/ATTRIBUTES THAT NEED/CAN BE OVERRIDDEN BY DEVELOPERS
  // **************************************************************************

  idProperty: null, // Calculated by constructor: last item of paramIds

  // Default error objects which might be used by this module.
  BadRequestError: e.BadRequestError,
  UnauthorizedError: e.UnauthorizedError,
  ForbiddenError: e.ForbiddenError,
  NotFoundError: e.NotFoundError,
  PreconditionFailedError: e.PreconditionFailedError,
  UnprocessableEntityError: e.UnprocessableEntityError,
  NotImplementedError: e.NotImplementedError,
  ServiceUnavailableError: e.ServiceUnavailableError,

  reposition: function( doc, options, cb ){

    console.log("REPOSITION CALLED! (JsonRestStores)");
    if( typeof( cb ) === 'undefined' ) cb = function(){};
    this.dbLayer.reposition( doc, options, cb );
  },

  constructor: function( DbLayer ){

    var self = this;

    // Accept the DB driver from the constructor. If it's not passed through the
    // constructor, then it must be already in the prototype (inherited or set)
    if( typeof( DbLayer ) !== 'undefined' ){
      self.DbLayer = DbLayer;
    }
    
    // The db driver must be defined
    if( typeof( self.DbLayer ) === 'undefined' || self.DbLayer == null ){
      throw( new Error("You must define a db driver, via constructor or via prototype (creating " + self.storeName + ')' ));
    }

    self.collectionName = this.collectionName ? this.collectionName : this.storeName;

    // If paramId is not specified, takes it from publicURL
    if( self.paramIds === null ){
      self.paramIds =  ( self.publicURL + '/').match(/:.*?\/+/g).map( function(i){return i.substr(1, i.length - 2 )  } );
    }
   
    // Sets proto.paramId, which (as for the principle of 
    // least surprise) must be the last paramId passed to
    // the store.
    self.idProperty = self._lastParamId();

    // The schema must be defined
    if( typeof( self.schema ) === 'undefined' || self.schema == null ){
      throw( new Error("You must define a schema") );
    }

    // the store name must be defined
    if( self.storeName === null  ){
      throw( new Error("You must define a store name for a store") );
    }


    //                   *** SETTING THE SCHEMAS ***


    // STEP #1: COMPLETE THE DB SCHEMA.
    //          Complete the DB `schema` with paramIds set as 'id', and make paramIds searchable

    // By default, paramIds are set in schema as { type: 'id' } so that developers
    // can be lazy when defining their schemas
    for( var i = 0, l = self.paramIds.length; i < l; i ++ ){
      var k = self.paramIds[ i ];
      if( typeof( self.schema.structure[ k ] ) === 'undefined' ){
         self.schema.structure[ k ] = { type: 'id' };
      }
    }

    // By default, add paramIds will be set as `searchable` in DB `schema`
    for( var i = 0, l = self.paramIds.length; i < l; i ++ ){
      var k = self.paramIds[ i ];
      self.schema.structure[ k ].searchable = true;
    }

   
    // STEP #2: MAKE SURE searchSchema IS DEFINED AND GOOD
    //          If not there, create it as a copy of `schema` where `searchable is there.
    //          If there, make sure that every item has `searchable`

    // If searchSchema wasn't defined, then set it as a copy of the schema where
    // fields are searchable, EXCLUDING the paramIds fields.
    if( self.searchSchema == null ){

      var searchSchemaWasGenerated = true;

      var searchSchemaStructure = { };
      for( var k in self.schema.structure ){
        if( typeof( self.paramIds[ k ] ) === 'undefined' && self.schema.structure[ k ].searchable ){
          searchSchemaStructure[ k ] = self.schema.structure[ k ];
        }
      }
      self.searchSchema = new self.schema.constructor( searchSchemaStructure );


    // If searchSchema WAS defined, then add `searchable` to all entries
    // Since it's a defined search schema, all of its entries need to be
    // searchable regardless.
    } else {

      var searchSchemaWasGenerated = false;

      for( var k in self.searchSchema.structure ){
        self.searchSchema.structure[ k ].searchable = true;
      }
    }


    // STEP #3: MAKE SURE THAT Db-LEVEL SCHEMA WILL INDEX PROPERLY  
    //          For every entry in searchSchema, add `searchable` to 
    //          corresponding entry in `schema`.

    // Make sure that, for every entry present in searchSchema,
    // the corresponding DB-level schema is searchable
    // (unless they are paramIds, in which case there is no point. AND YES, users might
    // decide that paramIds are in searchSchema, it already happens in Hotplate)
    for( var k in self.searchSchema.structure ){
    
      var entry = self.searchSchema.structure[ k ];

      // Simple case: no `searchOptions`. So, the search target is 
      // the same as `k`.
      if( typeof( entry.searchOptions ) === 'undefined' ){

        if( typeof( self.paramIds[ k ] ) === 'undefined' ){
          self.schema.structure[ k ].searchable = true;
        } 

      }

      // More complex case: `searchOptions` is there. This means that
      // the referenced field *might* be different.
      // Things are made tricky by the fact that searchOptions can be
      // an object, or an array of objects.
      // Array or not, objects can define a `field` key specifying which field
      // should be used for the search.
      else {
     
        if( Array.isArray( entry.searchOptions ) ){
          var elements = entry.searchOptions;
        } else {
          var elements = [ entry.searchOptions ];
        }

        elements.forEach( function( element ){
          var fieldName = element.field ? element.field : k;

          self.schema.structure[ fieldName ].searchable = true;
        });

      }
    }

    //                *** DONE: SETTING THE SCHEMAS ***


    var layerOptions = {
      schema: self.schema,
      nested: self.nested,
      idProperty: self.idProperty,
      schemaError: self.UnprocessableEntityError,
    };
    if( self.position ){
      layerOptions.positionField = '__position';
      layerOptions.positionBase = self.paramIds.slice( 1, -1 );
    }

    // Actually create the layer with the given parameters
    self.dbLayer = new self.DbLayer( self.collectionName, layerOptions );

    // Set the DB's hard limit on queries. DB-specific implementations will
    // set this to `true` if the query is not cursor-based (this will prevent
    // a million results from being returned)
    self.dbLayer.hardLimitOnQueries = self.hardLimitOnQueries;

  },

  // *********************************************************************
  // *** INDEXING FUNCTIONS (STUBS TO THE LAYER'S INDEXING FUNCTIONS)
  // *********************************************************************


  generateStoreAndSchemaIndexes: function( options, cb ){

    var self = this;

    this.dbLayer.generateSchemaIndexes( options, function( err ){
      if( err ) return cb( err );

      // TODO: Add more indexes:
      // * Add new index with { workspaceId: 1, searchableField: 1 } for each searchable if multiHome
      // * Add new index for paramIds
      // * MAYBE for each sortable, create paramIds + field

      cb( null );
    } );
  },

  // *********************************************************************
  // *** FUNCTIONS THAT ACTUALLY ACCESS DATA THROUGH THE DB DRIVER
  // *********************************************************************
 

  _enrichSelectorWithParams: function( selector, params ){
    
    var self = this;

    // filter.conditions.and needs to exist and be an object
    if( typeof( selector.conditions ) === 'undefined' || selector.conditions === null ){
      selector.conditions = {};
    }
    if( typeof( selector.conditions.and ) === 'undefined' || selector.conditions.and === null ){
      selector.conditions.and = [];
    } 
   
    // Add param IDs as "AND" conditions to the query
    self.paramIds.forEach( function( paramId ){
      if( typeof( params[ paramId ]) !== 'undefined' ){
        selector.conditions.and.push( { field: paramId, type: 'eq', value: params[ paramId ] } );
      }
    });

    // Remove 'and' array from selector condition if it is empty
    if (selector.conditions.and.length === 0) {
        delete selector.conditions.and;
    }

    // Remove conditions object from selector if there is no conditions
    if (Object.keys(selector.conditions).length === 0) {
        delete selector.conditions;
    }

    return selector;

  },


  execAllDbFetch: function( params, body, options, cb ){

    var self = this;

    // Make up the filter, based on the store's IDs (used as filters).
    var selector = {};

    self._enrichSelectorWithParams( selector, params );

    // Make the database call 
    self.dbLayer.select( selector, function( err, docs ){
      if( err ){
        cb( err );
      } else {
        if( docs.length === 0 ){
          cb( null, null );
        } else if( docs.length !== 1 ){

          cb( new self.ServiceUnavailableError({
            message: "execAllDbFetch fetched more than 1 record",
            data: {
              length: docs.length,
              selector: selector,
              store: self.storeName
            }
          }));
        } else {
          cb( null, docs[ 0 ] );
        }
      }
    });

  }, 

  execPostDbInsertNoId: function( params, body, options, generatedId, cb ){
   
    var self = this;

    var record = {};

    // Make up the `record` variable, based on the passed `body`
    for( var k in body ) record[ k ] = body[ k ];

    // Add param IDs to the record that is being written
    self.paramIds.forEach( function( paramId ){
      if( typeof( params[ paramId ] ) !== 'undefined' ){
        record[ paramId ] = params[ paramId ];
      }
    });

    // The last parameter is missing since it
    // wasn't passed: assign an ObjectId to it
    record[ self.idProperty ] = generatedId;

    self.dbLayer.insert( record, { returnRecord: true, skipValidation: true }, cb );

  },

  execPutDbUpdate: function( params, body, options, doc, fullDoc, cb ){

    var self = this;
    var updateObject = {};

    // Make up the filter, based on the store's IDs (used as filters).
    var selector = {};

    self._enrichSelectorWithParams( selector, params );

    // Make up the `updateObject` variable, based on the passed `body`
    for( var i in body ) updateObject[ i ] = body[ i ];

    // Add param IDs to the record that is being updated
    self.paramIds.forEach( function( paramId ){
      if( typeof( params[ paramId ] ) !== 'undefined' ){
        updateObject[ paramId ] = params[ paramId ];
      }
    });

    self.dbLayer.update( selector, updateObject, { deleteUnsetFields: true, multi: false, skipValidation: true }, function( err, howMany ){
      if( err ){
        cb( err );
      } else {

        self.dbLayer.select( selector, function( err, docs ){
          if( err ){
            cb( err );
          } else {
            if( docs.length === 0 ){
              cb( null, null );
            } else if( docs.length !== 1 ){

              cb( new self.ServiceUnavailableError({
                message: "dbLayer.update updated more than 1 record",
                data: { 
                  length: doc.length,
                  selector: selector,
                  store: self.storeName
                }
              }));

            } else {
              cb( null, docs[ 0 ] );
            }
          }
        });
      }
    });
  },


  execPutDbInsert: function( params, body, options, cb ){
  
    var self = this;

    var record = {};

    // Make up the `record` variable, based on the passed `body`
    for( var k in body ) record[ k ] = body[ k ];

    // Add param IDs to the record that is being written
    self.paramIds.forEach( function( paramId ){
      if( typeof( params[ paramId ] ) !== 'undefined' ){
        record[ paramId ] = params[ paramId ];
      }
    });

    self.dbLayer.insert( record, { returnRecord: true, skipValidation: true }, cb );

  },


  execDeleteDbDelete: function( params, body, options, cb ){

    var self = this;
    var selector = {};

    self._enrichSelectorWithParams( selector, params );
    self.dbLayer.delete( selector, { multi: false, skipValidation: true }, cb );
  },

  _queryMakeSelector: function( filters, sort, ranges, cb ){

    var self = this;
    var errors = [];
    var field, type, condition;

    // Define and set the conditions variable, which will be returned
    var conditions = {};
    conditions.and = [];
    conditions.or = [];


    // Add filters to the selector
    for( var filterField in filters ){

      var filterValue = filters[ filterField ];

      // There is a slim chance that  self.searchSchema.structure[ filterField ] is not there:
      // it happens in case the request is from API and it required a field available
      // in the main schema but NOT in the search schema
      var searchable = self.searchSchema.structure[ filterField ] && self.searchSchema.structure[ filterField ].searchable;
      var searchOptions = self.searchSchema.structure[ filterField ] && self.searchSchema.structure[ filterField ].searchOptions;

      //console.log("DEBUG:");
      //console.log( self.searchSchema.structure );
      //console.log( self.schema.structure );
    
      if( searchable || !self.remote ) {

        // searchOptions is not an object/is null: just set default conditions (equality with field)
        if( typeof( searchOptions ) !== 'object' || searchOptions === null ){
          field = filterField;
          type = 'eq';
          condition = 'and';
          conditions[ condition ].push( { field: field, type: type, value: filters[ filterField ] } );

        // searchOptions IS an object: it might be an array or a single condition set
        } else {
         
          // Make sure elements ends up as an array regardless
          if( Array.isArray( searchOptions ) ){
            var elements = searchOptions;
          } else {
            var elements = [ searchOptions ];
          }

          elements.forEach( function( element ){
            field = element.field || filterField;
            type = element.type || 'eq';
            condition = element.condition || 'and';

            conditions[ condition ].push( { field: field, type: type, value: filters[ filterField ] } );
          });

        }

      // Field is not searchable: error!
      } else {
        errors.push( { field: filterField, message: 'Field not allowed in search: ' + filterField + ' in ' + self.storeName } );
      }

    }

    // Call the callback with an error, or with the selector (containing conditions, ranges, sort)
    if( errors.length ){
      cb( new self.UnprocessableEntityError( { errors: errors } ) );
    } else {

      if( conditions.and.length === 0 ) delete conditions.and;
      if( conditions.or.length === 0 ) delete conditions.or;

      cb( null, {
        conditions: conditions,
        ranges: ranges,
        sort: sort,
      } );
    }

  },


  /*
      * FIRST:
      *   REMOTE: options.filters, options.sort, options.ranges are created by _initOptionsFromReq
      *   LOCAL: user sets options.filters, options.sort and options.ranges

      * AND THEN:
      *   self._queryMakeSelector( filters, sort, ranges ) is called, and returns the full db selector for those options
  */

  _initOptionsFromReq: function( mn, req ){

    var self = this;

    var options = {};

    // Set the 'overwrite' option if the right header
    // is there
    if( mn == 'Put' ){

      if( req.headers[ 'if-match' ] === '*' )
        options.overwrite = true;
      if( req.headers[ 'if-none-match' ] === '*' )
        options.overwrite = false;

    }

    // Put and Post can come with extra headers which will set
    // options.beforeId and options.relocation
    if( mn === 'Put' || mn === "Post" ){

      if( typeof( req.headers[ 'x-rest-before' ] ) !== 'undefined' )
        options.beforeId = req.headers[ 'x-rest-before' ];

      if( typeof( req.headers[ 'x-rest-relocation' ] ) !== 'undefined' )
        options.relocation = true;
    }

    // Set the 'SortBy', 'ranges' and 'filters' in
    // the options, based on the passed headers

    if( mn == 'GetQuery' ){
      options.sort = parseSortBy( req );
      options.ranges = parseRangeHeaders( req );
      options.filters = parseFilters( req );
    }

    return options;


    function parseSortBy( req ){

      var url_parts = url.parse( req.url, false );
      var q = url_parts.query || '';
      var sortField;
      var tokens, subTokens, subToken, subTokenClean, i;
      var sortObject = {};

      tokens = q.split( '&' ).forEach( function( item ) {

        var tokens = item.split('=');
        var tokenLeft = tokens[0];
        var tokenRight = tokens[1];

        if(tokenLeft === 'sortBy'){
          subTokens = tokenRight.split(',');
          for( i = 0; i < subTokens.length; i++ ){

            subToken = subTokens[ i ];
            subTokenClean = subToken.replace( '+', '' ).replace( '-', '' );

            if( ! self.remote || ( self.searchSchema.structure[ subTokenClean ] && self.searchSchema.structure[ subTokenClean ].sortable ) ){
              if( subTokens[ i ][ 0 ] === '+' || subTokens[ i ][ 0 ] === '-' ){
                var sortDirection = subTokens[ i ][ 0 ] == '-' ? -1 : 1;
                sortField = subTokens[ i ].replace( '+', '' ).replace( '-', '' );
                sortObject[ sortField ] = sortDirection;
              }
            }
          }
        }
      });
      return sortObject;
    }

    function parseRangeHeaders( req ){

      var tokens;
      var rangeFrom, rangeTo, limit;
      var hr;

      // If there was a range request, then set the range to the
      // query and return the count
      if( (hr = req.headers['range']) && ( tokens = hr.match(/items=([0-9]+)\-([0-9]+)$/))  ){
        rangeFrom = tokens[1] - 0;
        rangeTo = tokens[2] - 0;
        limit =  rangeTo - rangeFrom + 1;

        return( {
          from: rangeFrom,
          to: rangeTo,
          limit:  limit,
        });
      } 

      // Range headers not found or not valid, return null 
      return null;
    }


    function parseFilters( req ){

      var url_parts = url.parse( req.url, false );
      var q = url_parts.query || '';
      var tokens, tokenLeft, tokenRight;
      var result = {};
      var failedCasts;

      q.split( '&' ).forEach( function( item ) {

        tokens = item.split('=');
        tokenLeft  = tokens[0];
        tokenRight = tokens[1];

        // Only add it to the filter if it's in the schema AND if it's searchable
        //if( tokenLeft != 'sort' && ( ! self.remote || ( self.searchSchema.structure[ tokenLeft ] && self.searchSchema.structure[ tokenLeft ].searchable )) ) {
        if( tokenLeft != 'sortBy' && self.searchSchema.structure[ tokenLeft ] && self.searchSchema.structure[ tokenLeft ].searchable  ) {

          result[ tokenLeft ] = tokenRight;

        }
      });


      return result;
    }

  },


  execGetDbQuery: function( params, body, options, next ){

    var self = this;
    var cursor;
    var dbLayerOptions = {};

    // If options.delete was on or if it's set at store-level
    // pass {delete: true } to the db layer
    if( options.delete || self.deleteAfterGetQuery ){
      dbLayerOptions.delete = true;
    }

    if( typeof( options.sort ) === 'undefined' || options.sort === null ) options.sort = {}; 

    // Sort by self.positionField if sort is empty and self.positionField is defined
    //if( Object.keys( options.sort ).length === 0 && self.positionField ){
    //  options.sort[ self.positionField ] = 1;
    //}

    self._queryMakeSelector( options.filters, options.sort, options.ranges, function( err, selector ){
      if( err ){
        next( err );
      } else {

        self._enrichSelectorWithParams( selector, params );

        // Run the select based on the passed parameters
        self.dbLayer.select( selector, dbLayerOptions, next );
      }
    });

  },



  // ****************************************************
  // *** INTERNAL FUNCTIONS, DO NOT TOUCH
  // ****************************************************


  _extrapolateDocAndprepareBeforeSendAll: function( params, body, options, docs, cb ){

    var self = this;

    var changeFunctions = [];
    docs.forEach( function( fullDoc, index ){

      changeFunctions.push( function( callback ){

        self.extrapolateDoc(  params, body, options, fullDoc, function( err, doc ){
          if( err ){
            callback( err, null );
          } else {

            //self._castDoc( doc, function( err, doc) {
            //  if( err ){
            //    callback( err, null );
            //  } else {

                self.prepareBeforeSend( doc, function( err, doc ){
                  if( err ){
                    callback( err, null );
                  } else {
                    docs[ index ] = doc;
                    callback( null, null );
                  }
                });
            //  }
            //});

          }
        });
      });
    }); // docs.forEach

    async.parallel( changeFunctions, cb );

  },


  _lastParamId: function(){
    return this.paramIds[ this.paramIds.length -1 ];
  },

  // Check that paramsId are actually legal IDs using
  // paramsSchema
  _checkParamIds: function( params, body, skipIdProperty, next ){

    var self = this;
    var fakeRecord = {};
    var errors = [];

    // This shouldn't happen
    if( self.paramIds.length === 0 ) return next( null );

    // This is to optimise a little: if there is only
    // one self.paramIds and skipIdProperty is on,
    // the resulting fakeRecord would be empty and
    // this would be a big waste of time
    if( self.paramIds.length === 1 && skipIdProperty ) return next( null );

    // Make up the fake schema definition, based on the paramIds of the "real" schema
    // (In the meantime, also check that ALL paramIds are indeed required)
    self.paramIds.forEach( function(k ) {
      if( typeof( self.schema.structure[ k ] ) === 'undefined' ){
        throw new Error( 'This paramId must be in schema: ' + k);
      } else {
        if( !( skipIdProperty && k == self.idProperty ) ){

          // Copy values over from params to fakeRecord. If undefined,
          // raise an error (unless it's dealing with idProperty and it needs to be skipped)
          if( typeof( params[ k ] ) !== 'undefined' ){
            fakeRecord[ k ] = params[ k ];
          } else {
            if( !( skipIdProperty && k == self.idProperty ) ){
              errors.push( { field: k, message: 'Field required in the URL: ' + k } ); 
            }
          }
        }
      }
    });
    
    // If one of the key fields was missing, puke back
    if( errors.length ) return next( new self.BadRequestError( { errors: errors } ) );

    // Apply the schema (just paramIds) to the fake record (`onlyObjectValues` will ensure
    // that only the param IDs will be checked)
    self.schema.validate( fakeRecord, { onlyObjectValues: true }, function( err, fakeRecord, errors ){

      if( err ){
        next( err );
      } else {

        // There was a problem: return the errors
        if( errors.length ){
          next( new self.BadRequestError( { errors: errors } ) );
        } else {

          // Copy those cast values back onto the params and body, so that
          // other store calls will have ready-to-use cast
          // elements in `params` and `body`
          self.paramIds.forEach( function( k ) {
            params[ k ] = fakeRecord[ k ];
            body[ k ] = fakeRecord[ k ];
          });
          next( null );
        }
      }
    });

  },

  _sendErrorOnErr: function( err, next, cb ){
    if( err ) {
      this._sendError( next, err );
    } else {
      cb();
    }
  },

  _sendError: function( next, error ){

    var self = this;

    // It's a local call: simply call the callback passed by the caller
    if( ! self.remote ){
      next( error, null );
      return;
    }

    // This will happen when _sendError is passed an error straight from a callback
    // The idea is that jsonreststores _always_ throws an HTTP error of some sort.

    switch( self.chainErrors ){

      case 'all':
        next( error );
      break;

      case 'none':
      case 'nonhttp':

        var responseBody;

        // CASE #1: It's not an HTTP error and it's meant to chain non-HTTP errors: chain (call next)
        if( typeof( e[ error.name ] ) === 'undefined' && self.chainErrors === 'nonhttp' ){
           next( error );

        // CASE :2: Any other case. It might be an HTTP error or a JS error. Needs to handle both cases
        } else {

          // It's not an HTTP error: make up a new one, and incapsulate original error in it
          if( typeof( e[ error.name ] ) === 'undefined'  ){
            error = new self.ServiceUnavailableError( { originalErr: error } );
          } 

          // Make up the response body based on the error, and send it!
          responseBody =  self.formatErrorResponse( error );
          self._res.send( error.httpError, responseBody );
        }
      break;

    }
 
    self.logError( error );
  },




  // ****************************************************
  // *** METHOD FUNCTIONS - THE REAL DANCE STARTS HERE
  // ****************************************************


  _makePost: function( params, body, options, next ){

    var self = this;
    var body;

    if( typeof( next ) !== 'function' ) next = function(){};

    // Check that the method is implemented
    if( ! self.handlePost ){
      self._sendError( next, new self.NotImplementedError( ) );
      return;
    }

    // Check the IDs
    self._checkParamIds( params, body, true, function( err ){  
      // if( err ) return this._sendError( next, err );
      self._sendErrorOnErr( err, next, function(){

        self.prepareBody( body, 'post', function( err, body ){
          self._sendErrorOnErr( err, next, function(){
     
            var skipParamsObject = {};
            skipParamsObject[ self.idProperty ] = [ 'required' ];

            self.schema.validate( body, { skipParams: skipParamsObject, skipCast: [ self.idProperty ]  }, function( err, body, errors ){
              self._sendErrorOnErr( err, next, function(){
        

                if( errors.length ){
                  self._sendError( next, new self.UnprocessableEntityError( { errors: errors } ) );
                } else {
     
 
                   self.postValidate( body, 'post', function( err ){
                     self._sendErrorOnErr( err, next, function(){
  
                      // Actually check permissions
                      self.checkPermissionsPost( params, body, options, function( err, granted ){
                        self._sendErrorOnErr( err, next, function(){
            
                          if( ! granted ){
                            self._sendError( next, new self.ForbiddenError() );
                          } else {
            
                            // Clean up body from things that are not to be submitted
                            //if( self.schema ) self.schema.cleanup( body, 'doNotSave' );
                            self.schema.cleanup( body, 'doNotSave' );
            
                            self.schema.makeId( body, function( err, generatedId){
                              self._sendErrorOnErr( err, next, function(){
            
                                self.execPostDbInsertNoId( params, body, options, generatedId, function( err, fullDoc ){
                                  self._sendErrorOnErr( err, next, function(){
            
                                    //console.log("RUNNING RELOCATION:", fullDoc[ self.idProperty ], options && options.beforeId ? options.beforeId : null   );
                                    //self._relocation( fullDoc[ self.idProperty ], options && options.beforeId ? options.beforeId : 'null', params);
                                    self.reposition( fullDoc, options && options.beforeId ? options.beforeId : 'null' );
     
                                    self.extrapolateDoc( params, body, options, fullDoc, function( err, doc) {
                                      self._sendErrorOnErr( err, next, function(){
            
                                        //self._castDoc( doc, function( err, doc) {
                                          //self._sendErrorOnErr( err, next, function(){
                                        
                                            // Remote request: set headers, and send the doc back (if echo is on)
                                            if( self.remote ){
                
                                              // Set the Location header if it was a remote request
    
                                              self._res.setHeader( 'Location', self._req.originalUrl + doc[ self.idProperty ] );
    
                                              if( self.echoAfterPost ){
                
                                                self.prepareBeforeSend( doc, function( err, doc ){
                                                  self._sendErrorOnErr( err, next, function(){
                
                                                    self.afterPost( params, body, options, doc, fullDoc, function( err ){
                                                      self._sendErrorOnErr( err, next, function(){
                
                                                        self._res.json( 201, doc );
                                                      }) // err
                                                    }) // self.afterPost
                
                                                   }) // err
                                                }) // self.prepareBeforeSend
                
                                              } else {
                
                                                self.afterPost( params, body, options, doc, fullDoc, function( err ){
                                                  self._sendErrorOnErr( err, next, function(){
    
                                                    //self._res.send( 204, '' );
                                                    self._res.send( 201, '' );
                
                                                  });
                                                });
                
                                              }
                
                                            // Local request: simply return the doc to the asking function
                                            } else {
                
                                              self.prepareBeforeSend( doc, function( err, doc ){
                                                self._sendErrorOnErr( err, next, function(){
                
                                                  self.afterPost( params, body, options, doc, fullDoc, function( err ){
                                                    self._sendErrorOnErr( err, next, function(){
                
                                                      next( null, doc );
                
                                                    });
                                                  });
                
                                                });
                                              });
                                    
                                            } 
                
                                       
                                          //});
                                        //});
    
                                      });
                                    });
                
            
                                  });
                                });
            
                              });
                            });
            
                          }
            
                        });
                      });
            
                    });
                  });
                }
            
              });
            });
      
          });
        });

      });
    });

  },

  _makePut: function( params, body, options, next ){

    var self = this;
    var overwrite;
    var body;


    if( typeof( next ) !== 'function' ) next = function(){};

    // Check that the method is implemented
    if( ! self.handlePut ){
      self._sendError( next, new self.NotImplementedError( ) );
      return;
    }

    // DETOUR: It's a relocation. Simply try and relocate the record
    // (after the usual permissions etc.)
    if( options.relocation && options.beforeId ){
      
      self._checkParamIds( params, body, false, function( err ){  
        self._sendErrorOnErr( err, next, function(){

          self.execAllDbFetch( params, body, options, function( err, fullDoc ){
            self._sendErrorOnErr( err, next, function(){

              if( ! fullDoc ){
                self._sendError( next, new self.NotFoundError());
              } else {

                self.extrapolateDoc( params, body, options, fullDoc, function( err, doc) {
                  self._sendErrorOnErr( err, next, function(){
        
                    //self._castDoc( doc, function( err, doc) {
                      //self._sendErrorOnErr( err, next, function(){
        
                        // Actually check permissions
                        self.checkPermissionsPutExisting( params, body, options, doc, fullDoc, function( err, granted ){
                          self._sendErrorOnErr( err, next, function(){
            
                            if( ! granted ){
                              self._sendError( next, new self.ForbiddenError() );
                            } else {

                              //self._relocation( fullDoc[ self.idProperty ], options.beforeId, params );
                              self.reposition( fullDoc, options && options.beforeId ? options.beforeId : 'null' );

                              self.prepareBeforeSend( doc, function( err, doc ){
                                self._sendErrorOnErr( err, next, function(){

                                  self.afterPutExisting( params, body, options, doc, fullDoc, doc, fullDoc, options.overwrite, function( err ) {
                                    self._sendErrorOnErr( err, next, function(){

                                      if( self.remote ){ 
                                        self._res.json( 200, doc );
                                      } else {
                                        next( null, doc );
                                      }
                                    });
                                  });

                                });
                              });
                            }
                          });
                        });

                      //});
                    //});
                 
                  });
                });
 
              }
            });
          });

        });
      });

      // That's it -- don't do anything else.
      return;
    }
 
    // Check the IDs.
    self._checkParamIds( params, body, false, function( err ){  
      self._sendErrorOnErr( err, next, function(){

        self.prepareBody( body, 'put', function( err, body ){
          self._sendErrorOnErr( err, next, function(){

            self.schema.validate(  body, function( err, body, errors ) {
              self._sendErrorOnErr( err, next, function(){
        
                if( errors.length ){
                  self._sendError( next, new self.UnprocessableEntityError( { errors: errors } ) );
                } else {
   
                  self.postValidate( body, 'put', function( err ){
                    self._sendErrorOnErr( err, next, function(){
 
            
                      // Fetch the doc
                      self.execAllDbFetch( params, body, options, function( err, fullDoc ){
                        self._sendErrorOnErr( err, next, function(){
              
                          // Check the 'overwrite' option
                          if( typeof( options.overwrite ) !== 'undefined' ){
                            if( fullDoc && ! options.overwrite ){
                              self._sendError( next, new self.PreconditionFailedError() );
                            } else if( !fullDoc && options.overwrite ) {
                              self._sendError( next, new self.PreconditionFailedError() );
                            } else {
                              continueAfterFetch();
                            }
                          } else { 
                            continueAfterFetch();
                          }
                
                          function continueAfterFetch(){
            
                            // It's a NEW doc: it will need to be an insert, _and_ permissions will be
                            // done on inputted data
                            if( ! fullDoc ){
                            
                              // Actually check permissions
                              self.checkPermissionsPutNew( params, body, options, function( err, granted ){
                                self._sendErrorOnErr( err, next, function(){
            
            
                                  if( ! granted ){
                                    self._sendError( next, new self.ForbiddenError() );
                                  } else {
            
                                    // Clean up body from things that are not to be submitted
                                    // if( self.schema ) self.schema.cleanup( body, 'doNotSave' );
                                    self.schema.cleanup( body, 'doNotSave' );
            
                                    // Paranoid check
                                    // Make sure that the id property in the body does match
                                    // the one passed as last parameter in the list of IDs
                                    body[ self.idProperty ] = params[ self.idProperty ];
            
                                    self.execPutDbInsert( params, body, options, function( err, fullDoc ){
                                      self._sendErrorOnErr( err, next, function(){
            
                                        //self._relocation( fullDoc[ self.idProperty ], options.beforeId, params );
                                        self.reposition( fullDoc, options && options.beforeId ? options.beforeId : 'null' );
    
                                        self.extrapolateDoc( params, body, options, fullDoc, function( err, doc) {
                                          self._sendErrorOnErr( err, next, function(){
            
                                            //self._castDoc( doc, function( err, doc) {
                                              //self._sendErrorOnErr( err, next, function(){
            
                                                // Remote request: set headers, and send the doc back (if echo is on)
                                                if( self.remote ){
                
                                                  // Set the Location header if it was a remote request
                                                  self._res.setHeader( 'Location', self._req.originalUrl );
                                                  if( self.echoAfterPutNew ){
                
                                                    self.prepareBeforeSend( doc, function( err, doc ){
                                                      self._sendErrorOnErr( err, next, function(){
                                                        self.afterPutNew( params, body, options, doc, fullDoc, options.overwrite, function( err ){
                                                          self._sendErrorOnErr( err, next, function(){
                
                                                            self._res.json( 201, doc );
                                                          });
                                                        });
                                                      });
                                                    });
                                                  } else {
                
                                                    self.afterPutNew( params, body, options, doc, fullDoc, options.overwrite, function( err ){
                                                      self._sendErrorOnErr( err, next, function(){
                
                                                        self._res.send( 201, '' );
                
                                                      });
                                                    });
                                                  }
                
                                                // Local request: simply return the doc to the asking function
                                                } else {
                                                  self.prepareBeforeSend( doc, function( err, doc ){
                                                    self._sendErrorOnErr( err, next, function(){
                
                                                      self.afterPutNew( params, body, options, doc, fullDoc, options.overwrite, function( err ){
                                                        self._sendErrorOnErr( err, next, function(){
                
                                                          next( null, doc );
                
                                                        });
                                                      });
                
                                                    });
                                                  });
    
                                                }
                
                                              //});
                                            //});
    
                                          });
                                        });
                
                                    
                                      });
                                    });
            
                                  }
            
                                });
                              });
           
                
                            // It's an EXISTING doc: it will need to be an update, _and_ permissions will be
                            // done on inputted data AND existing doc
                            } else {
        
                              self.extrapolateDoc( params, body, options, fullDoc, function( err, doc) {
                                self._sendErrorOnErr( err, next, function(){
            
                                  //self._castDoc( doc, function( err, doc) {
                                    //self._sendErrorOnErr( err, next, function(){
            
                                      // Actually check permissions
                                      self.checkPermissionsPutExisting( params, body, options, doc, fullDoc, function( err, granted ){
                                        self._sendErrorOnErr( err, next, function(){
                
                                          if( ! granted ){
                                            self._sendError( next, new self.ForbiddenError() );
                                          } else {
                
                                            // Clean up body from things that are not to be submitted
                                            // if( self.schema ) self.schema.cleanup( body, 'doNotSave' );
                                            self.schema.cleanup( body, 'doNotSave' );
                
                                            self.execPutDbUpdate( params, body, options, doc, fullDoc, function( err, fullDocAfter ){
                                              self._sendErrorOnErr( err, next, function(){
           
                                               //self._relocation( fullDoc[ self.idProperty ], options.beforeId, params );
                                               self.reposition( fullDoc, options && options.beforeId ? options.beforeId : 'null' );
     
                                                self.extrapolateDoc( params, body, options, fullDocAfter, function( err, docAfter ) {
                                                  self._sendErrorOnErr( err, next, function(){
    
            
                                                    //self._castDoc( docAfter, function( err, docAfter ) {
                                                      //self._sendErrorOnErr( err, next, function(){
                    
                                                        // Remote request: set headers, and send the doc back (if echo is on)
                                                        if( self.remote ){
                    
                                                          // Set the Location header if it was a remote request
                                                          self._res.setHeader( 'Location', self._req.originalUrl );
                    
                                                          if( self.echoAfterPutExisting ){
                    
                                                            self.prepareBeforeSend( docAfter, function( err, docAfter ){
                                                              self._sendErrorOnErr( err, next, function(){
                    
                                                                self.afterPutExisting( params, body, options, doc, fullDoc, docAfter, fullDocAfter, options.overwrite, function( err ) {
                                                                  self._sendErrorOnErr( err, next, function(){
                    
                                                                    self._res.json( 200, docAfter );
                    
                                                                  });
                                                                });
                    
                                                              });
                                                            });
                                                          } else {
                    
                                                            self.afterPutExisting( params, body, options, doc, fullDoc, docAfter, fullDocAfter, options.overwrite, function( err ) {
                                                              self._sendErrorOnErr( err, next, function(){
                    
                                                                self._res.send( 200, '' );
                                                                //res.send( 204, '' );
                    
                                                              });
                                                            });
                                                          }
                    
                                                        // Local request: simply return the doc to the asking function
                                                        } else {
                                                          self.prepareBeforeSend( docAfter, function( err, docAfter ){
                                                            self._sendErrorOnErr( err, next, function(){
    
    
                                                              self.afterPutExisting( params, body, options, doc, fullDoc, docAfter, fullDocAfter, options.overwrite, function( err ) {
                                                                self._sendErrorOnErr( err, next, function(){
     
                                                                  next( null, docAfter );
    
                                                                });
                                                              });
                                                            });
                                                          });
                                                        }
                    
                                                      //});
                                                    //});
            
                                                  });
                                                });
            
                
                                              });
                                            });
                
                                          }
                
                                        });
                                      });
                
                                    //});
                                  //});
            
                                });
                              });
        
                            }
            
                          }
                
                        });
                      });
           
                    });
                  });
     
                }
        
              });
            });

          });
        });

      });
    });

  },

  // Helper function for _makeGetQuery
  _validateSearchFilter: function( filters, options, cb ){

    var self = this;

    // If it's a remote call, then simply validate using the searchSchema
    if( self.remote ){
      return self.searchSchema.validate( filters, options, cb);
    }

    // If it's a local call, validate using a new schema made up with the searchSchema AND
    // the common schema merged together
    var schemaStructure = {};
    for( var k in self.searchSchema.structure ) schemaStructure[ k ] = self.searchSchema.structure[ k ];
    for( var k in self.schema.structure ) schemaStructure[ k ] = schemaStructure[ k ] || self.schema.structure[ k ];

    var newSchema = new self.searchSchema.constructor( schemaStructure );
    newSchema.validate( filters, options, cb );
  },

  _makeGetQuery: function( params, body, options, next ){

    var self = this;
    var sort, range, filters;

    //console.log("OPTIONS:");
    //console.log( options );

    if( typeof( next ) !== 'function' ) next = function(){};

    // Check that the method is implemented
    if( ! self.handleGetQuery ){
      self._sendError( next, new self.NotImplementedError( ) );
      return;
    }
  
    // Check the IDs. If there is a problem, it means an ID is broken:
    // return a BadRequestError
    self._checkParamIds( params, body, true, function( err ){  
      self._sendErrorOnErr( err, next, function(){
    
        self.checkPermissionsGetQuery( params, body, options, function( err, granted ){
          self._sendErrorOnErr( err, next, function(){
    
            if( ! granted ){
              self._sendError( next, new self.ForbiddenError() );
            } else {
    
              self._validateSearchFilter( options.filters, { onlyObjectValues: true }, function( err, filters, errors ){
              //self.searchSchema.validate( options.filters, { onlyObjectValues: true }, function( err, filters, errors ){
                self._sendErrorOnErr( err, next, function(){

                  // Actually assigning cast and validated filters to `options`
                  options.filters = filters;

                  // Errors in casting: give up, run away
                  if( errors.length ){
                    self._sendError( next, new self.BadRequestError( { errors: errors } ) );
                  } else {
        
                    self.execGetDbQuery( params, body, options, function( err, queryDocs, total, grandTotal ){
                      self._sendErrorOnErr( err, next, function(){
       
                        self._extrapolateDocAndprepareBeforeSendAll( params, body, options, queryDocs, function( err ){
                          self._sendErrorOnErr( err, next, function(){
        
                            self.afterGetQuery( params, body, options, queryDocs, function( err ) {
                              self._sendErrorOnErr( err, next, function(){

                                // Remote request: set headers, and send the doc back (if echo is on)
                                if( self.remote ){

                                  if( options.ranges ){
                                    var from, to, of;
                                    from = total ? options.ranges.from : 0;
                                    to = total ? options.ranges.from + total - 1 : 0 ;
                                    of = grandTotal;
                                    self._res.setHeader('Content-Range', 'items ' + from + '-' + to + '/' + of );
                                  }
                                  self._res.json( 200, queryDocs );
                                // Local request: simply return the doc to the asking function
                                } else {
                                  next( null, queryDocs );
                                }

                              });
                            });
          
                          });
                        });
        
                      });
        
        
                    });
                  }
    
                });
              });
    
    
            }
    
          });
        });
    
      });
    });
  },


  _makeGet: function( params, body, options, next ){

    var self = this;


    if( typeof( next ) !== 'function' ) next = function(){};

    // Check that the method is implemented
    if( ! self.handleGet ){
      self._sendError( next, new self.NotImplementedError( ) );
      return;
    }

    // Check the IDs
    self._checkParamIds( params, body, false, function( err ){  
      self._sendErrorOnErr( err, next, function(){

        // Fetch the doc.
        self.execAllDbFetch( params, body, options, function( err, fullDoc ){
          self._sendErrorOnErr( err, next, function(){
    
            if( ! fullDoc ){
              self._sendError( next, new self.NotFoundError());
            } else {
    
              self.extrapolateDoc( params, body, options, fullDoc, function( err, doc) {
                self._sendErrorOnErr( err, next, function(){
    
                  //self._castDoc( doc, function( err, doc) {
                  //  self._sendErrorOnErr( err, next, function(){
        
                      // Check the permissions 
                      self.checkPermissionsGet( params, body, options, doc, fullDoc, function( err, granted ){
                        self._sendErrorOnErr( err, next, function(){
        
                          if( ! granted ){
                            self._sendError( next, new self.ForbiddenError() ); 
                          } else {
                        
        
                            // "preparing" the doc. The same function is used by GET for collections 
                            self.prepareBeforeSend( doc, function( err, doc ){
                              self._sendErrorOnErr( err, next, function(){
        
                                self.afterGet( params, body, options, doc, fullDoc, function( err ) {
                                  self._sendErrorOnErr( err, next, function(){
                    
                                    // Remote request: set headers, and send the doc back (if echo is on)
                                    if( self.remote ){
        
                                      // Send "prepared" doc
                                      self._res.json( 200, doc );
        
                                    // Local request: simply return the doc to the asking function
                                     } else {
                                       next( null, doc );
                                     }
        
        
                                  });
                                });
        
        
                              });
                            });
        
                          }
        
                        });
                      });
        
        
                  //  });
                  //});
                });
              });
    
            }

          })
        });

      });
    });
  },


  _makeDelete: function( params, body, options, next ){

    var self = this;
    
    if( typeof( next ) !== 'function' ) next = function(){};
  
    // Check that the method is implemented
    if( ! self.handleDelete ){
      self._sendError( next, new self.NotImplementedError( ) );
      return;
    }
  
    // Check the IDs
    self._checkParamIds( params, body, false, function( err ){ 
      self._sendErrorOnErr( err, next, function(){
    
        // Fetch the doc.
        self.execAllDbFetch( params, body, options, function( err, fullDoc ){
          self._sendErrorOnErr( err, next, function(){
    
            if( ! fullDoc ){
              self._sendError( next, new self.NotFoundError());
            } else {
    
              self.extrapolateDoc( params, body, options, fullDoc, function( err, doc) {
                self._sendErrorOnErr( err, next, function(){
    
                  //self._castDoc( doc, function( err, doc) {
                    //self._sendErrorOnErr( err, next, function(){
        
                      // Check the permissions 
                      self.checkPermissionsDelete( params, body, options, doc, fullDoc, function( err, granted ){
                        self._sendErrorOnErr( err, next, function(){
        
                          if( ! granted ){
                            self._sendError( next, new self.ForbiddenError() );
                          } else {
                      
        
                            // Actually delete the document
                            self.execDeleteDbDelete( params, body, options, function( err ){
                              self._sendErrorOnErr( err, next, function(){
        
                                self.afterDelete( params, body, options, doc, fullDoc, function( err ) {
                                  self._sendErrorOnErr( err, next, function(){
        
                                    // Remote request: send a 204 back
                                    if( self.remote ){
                                      // Return 204 and empty contents as requested by RFC
                                      self._res.send( 204, '' );
        
                                    // Local request: simply return the doc's ID to the asking function
                                    } else {
                                      next( null, doc );
                                    }
        
                                  });
                                });
        
                              });
                            });
        
                          }
        
        
                        });
                      });
        
                    //});
                  //});

                });
              });
    
            }
    
          });
        });
    
      });
    });
  },
    
});


// ****************************************************
// *** ONLINE USE OF FUNCTIONS
// ****************************************************


// Make up the class method "online.XXX"
Store.online = {};

// Make Store.makeGet(Class), Store.makeGetQuery(Class), etc.
[ 'Get', 'GetQuery', 'Put', 'Post', 'Delete' ].forEach( function(mn){
  Store.online[mn] = function( Class ){
    return function( req, res, next ){

      var request = new Class();
   
      // It's definitely remote
      request.remote = true;

      // Sets the request's _req and _res variables
      request._req = req;
      request._res = res;

      // Set the params and body options, copying them from `req`
      var params = {}; for( var k in req.params) params[ k ] = req.params[ k ];
      var body = {}; for( var k in req.body) body[ k ] = req.body[ k ];

      // Since it's an online request, options are set by "req"
      // This will set things like ranges, sort options, etc.
      var options = request._initOptionsFromReq( mn, req );

      // The "delete" option can apply to GetQuery
      if( mn === 'GetQuery' ){
        options.delete = !!request.deleteAfterGetQuery;
      }

      if(Store.artificialDelay ) {
        setTimeout( function(){
          // Actually run the request
          request['_make' + mn ]( params, body, options, next );
        }, Store.artificialDelay );
      } else {
        request['_make' + mn ]( params, body, options, next );
      }

    }
  }
});


Store.onlineAll = function( app, url ){

  // Class is `this`. Since Store is the constructor, and onlineAll is
  // a method, `this` is the contructor. 
  var Class = this;

  // If needed (no url parameter), Instance the class in order to get the stores'
  // publicURL attribute. Maybe I should get it straight from the prototype,
  // but what if the constructor got subclassed?
  if( ! url ){ 
    var o = new Class();
    var url = o.publicURL;
  }

  // We need a URL, or it's all bananas and pears
  if( ! url ){
    throw( new Error("Store " + o.storeName + " had onlineAll() called, but no suitable URL could be found" ) );
  }

  // OK, everything is dandy: work out base URL and id, and create the Express routes
  var idName = url.match( /:\w*$/ )[0];
  url = url.replace( /:\w*$/, '');

  // Make entries in "app", so that the application
  // will give the right responses
  app.get(      url + idName, Store.online.Get( Class ) );
  app.get(      url,          Store.online.GetQuery( Class ) );
  app.put(      url + idName, Store.online.Put( Class ) );
  app.post(     url,          Store.online.Post( Class ) );
  app.delete(   url + idName, Store.online.Delete( Class ) );
}



// ****************************************************
// *** REST FUNCTIONS AS CLASS METHODS
// ****************************************************


Store.Get = function( id, options, next ){

  var Class = this;

  // Make `options` argument optional
  var len =  arguments.length;
  if( len == 2 ) { next = options; options = {}; };

  // Make up the request
  try {

  var request = new Class();
  } catch (e ){
    console.log("ERROR: " , e );
  }

  // Fix it for the API
  _fixRequestForApi( request );

  // Make up "params" to be passed to the _makeGet function
  var params = {};
  params[ request._lastParamId() ] = id;

  // Turn off permissions etc.
  request.checkPermissionsGet = function( params, body, options, doc, fullDoc, cb ){ cb( null, true ); };

  // Actually run the request
  request._makeGet( params, {}, options, next );
}



Store.GetQuery = function( options, next ){

  var Class = this;

  // Make up the request
  var request = new Class();

  // Fix it for the API
  _fixRequestForApi( request );

  // Turn off permissions etc.
  request.checkPermissionsGetQuery = function( params, body, options, cb ){ cb( null, true ); };

  // Actually run the request
  request._makeGetQuery( {}, {}, options, next );
}



Store.Put = function( id, body, options, next ){

  var Class = this;

  // Make `options` argument optional
  var len =  arguments.length;
  if( len == 3 ) { next = options; options = {}; };

  // Make up the request
  var request = new Class();

  // Make sure all paramIds ARE in body (normal checks
  // in _makePut will not work as paramIds will get zapped
  var errors = _checkThatParamIdsArePresent( body, request.paramIds, 0 );
  if( errors.length ) return next( new request.BadRequestError( { errors: errors } ) );

  // Fix it for the API (will also zap request.paramIds)
  _fixRequestForApi( request );

  // Make up "params" to be passed to the _makeGet function
  var params = {};

  // Sets only idProperty in the params hash. Note that
  // you might well decide to pass the whole object in body, and
  // pass 'null' as the object ID: in that case, this function
  // will sort out `params` with the `id` set
  if( id !== null ){
    params[ request.idProperty ] = id;
  } else {
    var idInBody = body[ request.idProperty ];
    if( typeof( idInBody ) !== 'undefined'){
      params[ request.idProperty ] = body[ request.idProperty ];
    } else {
      throw( new Error("When calling Store.Put with an ID of null, id MUST be in body") );
    }
  }

  // Turn off permissions etc.
  request.checkPermissionsPutExisting = function( params, body, options, doc, fullDoc, cb ){ cb( null, true ); };
  request.checkPermissionsPutNew = function(  params, body, options, cb ){ cb( null, true ); };

  // Actually run the request
  request._makePut( params, body, options, next );
}

Store.Post = function( body, options, next ){

  var Class = this;

  // Make `options` argument optional
  var len =  arguments.length;
  if( len == 2 ) { next = options; options = {}; };

  // Make up the request
  var request = new Class();

  // Make sure all paramIds ARE in body (normal checks
  // in _makePost will not work as paramIds will get zapped in a second
  var errors = _checkThatParamIdsArePresent( body, request.paramIds, 1 );
  if( errors.length ) return next( new request.BadRequestError( { errors: errors } ) );

  // Fix it for the API (will also zap request.paramIds)
  _fixRequestForApi( request );

  // Enrich `options` with `queryFilterType` and `searchConditions`
  // request._enrichOptionsFromClassDefaults( options );

  // Turn off permissions etc.
  request.checkPermissionsPost = function( params, body, options, cb ){ cb( null, true ); };

  // Actually run the request
  request._makePost( {}, body, options, next );
}

Store.Delete = function( id, options, next ){

  var Class = this;

  // Make `options` argument optional
  var len =  arguments.length;
  if( len == 2 ) { next = options; options = {}; };

  // Make up the request
  var request = new Class();

  // Fix it for the API
  _fixRequestForApi( request );

  // Make up "params" to be passed to the _makeDelete function
  var params = {};
  params[ request._lastParamId() ] = id;

  // Turn off permissions etc.
  request.checkPermissionsDelete = function( params, body, options, doc, fullDoc, cb ){ cb( null, true ); };

  // Actually run the request
  request._makeDelete( params, {}, options, next );
}


function _fixRequestForApi( request ){

    // Strip all of the paramIds dictated by the original
    // definition, just leaves the last one
    request.paramIds = Array( request._lastParamId() );

    // Makes sure it handles all types of requests
    request.handlePut = true;
    request.handlePost = true;
    request.handleGet = true;
    request.handleGetQuery = true;
    request.handleDelete = true;

    // It's not a remote request
    request.remote = false;   
}


function _checkThatParamIdsArePresent( body, paramIds, skipLast ){
  var errors = [], k;

  // Check all of them except the last skipLast (this will be set to 1 for Post()
  // as in Post() the ID won't be in the body
  var l = paramIds.length - skipLast;

  for( var i = 0; i < l; i ++){
     k = paramIds[ i ];

    // Suspicion starts: the body is undefined!
    if( typeof( body[ k ] ) === 'undefined' ){

      // Last escape: it might be a Put() and we might be checking
      // for the ID (the last item in paramIds): in this case, it WON'T
      // add the error as you can do Store.Put( 10, { name: 'Tony', surname: 'Mobily' } ) without
      // the ID in the body
      if( !skipLast && k !== paramIds[ l - 1 ] ){
        errors.push( { field: k, message: 'Field required in the URL (API): ' + k } );
      }
    } 
  };

  return errors;
}

exports = module.exports = Store;
Store.artificialDelay = 0;

/*
  _castDoc: function( doc, next ){

    var self = this;

    // Cast the values. This is a relaxed check: if a field is missing, it won't
    // complain. This way, applications won't start failing when adding fields
    var skipCast = [];
    if( self.positionField ) {
      skipCast.push( self.positionField );
    }

    self.schema.validate( doc, { onlyObjectValues: true, deserialize: true, skipCast: skipCast }, function( err, doc, errors ) {
      if( err ){
        next( err );
      } else {

        // There was a problem: return the errors
        // (but only if strictSchemaAfterRefetching is on)
        // TODO: maybe, in case of errors, if **params** have errors, it should still chuck
        // an error since things could go quite wrong if one of the params doesn't cast
        if( self.strictSchemaAfterRefetching && errors.length ){
          next( new self.UnprocessableEntityError( { errors: errors, whileRefetching: true } ) );
        } else {
          next( null, doc );
        }
      }
    });

  },
*/
