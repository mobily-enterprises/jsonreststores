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
KEEP IN MIND:

- SimpleDbLayer MUST enforce the one-object=one-table rule, otherwise its registry won't work
- JsonRestStores must be passed schema, nested, idproperty  to create the layer with
- If two stores have the same collectionName, the second one will reuse the existing one.
- This means that you can create the stores beforehand, and then get JsonRestStores to use them (nice!)
- In case of reusing, schema, nested, and hardLimitOnQueries, sortableFields mustn't be declared, and idProperty needs to match
*/

var 
  dummy
, e = require('allhttperrors')
, declare = require('simpledeclare')
, Schema = require('simpleschema')
, url = require('url')
, async = require('async')
, querystring = require('querystring')
;

var Store = declare( null,  {

  // ***********************************************************
  // *** ATTRIBUTES THAT ALWAYS NEED TO BE DEFINED IN PROTOTYPE
  // ***********************************************************

  DbLayer: null,
  storeName: null,

  // ****************************************************
  // *** ATTRIBUTES THAT CAN TO BE DEFINED IN PROTOTYPE
  // ****************************************************

  onlineSearchSchema: null, // If not set in prototype, worked out from `schema` by constructor
  collectionName: null, // If not set in prototype, is set as `storeName` by constructor
  publicURL: null, // Not mandatory (if you want your store to be API-only for some reason)
  idProperty: null, // If not set in prototype, taken as last item of paramIds)
  paramIds: [], // Only allowed if publicURL is not set


  // *****************************************************************
  // *** ATTRIBUTES USED TO CREATE A STORE (IF NOT IN DBLAYER CACHE)
  // *** (Note: only allowed if collectionName not already in dbLayer cache
  // *****************************************************************

  schema: null,
  nested: [],
  hardLimitOnQueries: 50,
  sortableFields: [],

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
  echoAfterDelete: true,

  chainErrors: 'none',  // can be 'none', 'all', 'nonhttp'

  deleteAfterGetQuery: false,

  strictSchemaAfterRefetching: false, // TO IMPLEMENT

  position: false, // If set, will make fields re-positionable

  // ****************************************************
  // *** FUNCTIONS THAT CAN BE OVERRIDDEN BY DEVELOPERS
  // ****************************************************

  // Doc extrapolation and preparation calls
  extrapolateDoc: function( request, fullDoc, cb ){ cb( null, fullDoc ); },
  prepareBeforeSend: function( request, doc, cb ){ cb( null ); },

  // "after" calls
  afterPutNew: function( request, doc, fullDoc, overwrite, cb ){ cb( null ) },
  afterPutExisting: function( request, doc, fullDoc, docAfter, fullDocAfter, overwrite, cb ){ cb( null ) },
  afterPost: function( request, doc, fullDoc, cb){ cb( null ); },
  afterDelete: function( request, doc, fullDoc, cb ){ cb( null ); },
  afterGet: function( request, doc, fullDoc, cb ) { cb( null ); },
  afterGetQuery: function( request, queryDocs, cb ) { cb( null ); },

  // Permission stock functions
  checkPermissionsPost: function( request, cb ){ cb( null, true ); },
  checkPermissionsPutNew: function( request, cb ){ cb( null, true ); },
  checkPermissionsPutExisting: function( request, doc, fullDoc, cb ){ cb( null, true ); },
  checkPermissionsGet: function( request, doc, fullDoc, cb ){ cb( null, true ); },
  checkPermissionsGetQuery: function( request, cb ){ cb( null, true ); },
  checkPermissionsDelete: function( request, doc, fullDoc, cb ){ cb( null, true ); },

  // Body preparation and postvalidation functions
  prepareBody: function( request, body, method, cb ){ cb( null ); },
  postValidate: function( request, body, method, cb ){ cb( null ); },

  logError: function( error ){ },

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

  dbLayer: null, // Create by constructor: an instance of dbLayer()

  // Default error objects which might be used by this module.
  BadRequestError: e.BadRequestError,
  UnauthorizedError: e.UnauthorizedError,
  ForbiddenError: e.ForbiddenError,
  NotFoundError: e.NotFoundError,
  PreconditionFailedError: e.PreconditionFailedError,
  UnprocessableEntityError: e.UnprocessableEntityError,
  NotImplementedError: e.NotImplementedError,
  ServiceUnavailableError: e.ServiceUnavailableError,

  reposition: function( doc, putBefore, putDefaultPosition, existing, cb ){
    if( typeof( cb ) === 'undefined' ) cb = function(){};

    console.log("CALLED REPOSITION ON:", doc, putBefore, putDefaultPosition, existing );

    // No position field: nothing to do
    if( ! this.dbLayer.positionField ){
       console.log("JSsonRestStores skipped repositioning as layer doesn't have positionField: ", this.table );
       return cb( null );
    }
    
    // where can be `start, `end`, or `at`. If it's `at`, then beforeId will be considered
    var where, beforeId;

    // CASE #1: putBefore is set: where = at, beforeId = putBefore 
    if( putBefore ) {
      where = 'at';
      beforeId = putBefore;

    // CASE #2: putDefaultPosition is set: where = putDefaultPosition, beforeId = null
    } else if( putDefaultPosition ){
      where = putDefaultPosition;
      beforeId = null;

    // CASE #3: putBefore and putDefaultPosition are not set. IF it's a new record, where = end, beforeId = null
    } else {
      if( !existing ){
        where = 'end';
        beforeId = null;
      }
    }

    console.log("LAYER'S REPOSITION PARAMETERS BASED ON CALL:", where, beforeId );

    this.dbLayer.reposition( doc, where, beforeId, cb );
  },

  constructor: function(){

    var self = this;

    // StoreName cannot be repeated amongst stores, ONE storeName per store!
    Store.registry = Store.registry || {};
    if( typeof( Store.registry[ self.storeName ] ) !== 'undefined' ){
      throw new Error("Cannot instantiate two stores with the same name: " + self.storeName );
    }

    // The db driver must be defined
    if( self.DbLayer == null ){
      throw( new Error("You must define a db driver in constructor class (creating " + self.storeName + ')' ));
    }

    // the store name must be defined
    if( self.storeName === null  ){
      throw( new Error("You must define a store name for a store in constructor class") );
    }

    // If collectionName is not specified, it will deduct it from storeName
    self.collectionName = this.collectionName ? this.collectionName : this.storeName;

    // Cannot have paramIds set up AS WELL AS publicURL -- one or the other
    /*
    if( self.paramIds && self.publicURL ){
       throw( new Error( "paramIds and publicURL are mutually exclusive when creating a store" ) );
    }
    */

    // If paramId is not specified, takes it from publicURL
    if( self.paramIds.length === 0 && typeof( self.publicURL ) === 'string' ){
      self.paramIds =  ( self.publicURL + '/').match(/:.*?\/+/g).map( function(i){return i.substr(1, i.length - 2 )  } );
    }
   
    // idProperty needs to be set; if it's not, and it's not possible to take it from paramIds, throw
    if( ! self.idProperty && self.paramIds.length === 0 ){
      throw( new Error("Your store needs to set idProperty, or alternatively set paramIds (idProperty will be the last paramId). Store: " + self.storeName ) );
    }

    // Sets self.idProperty, which (as for the principle of 
    // least surprise) must be the last paramId passed to
    // the store.
    if( ! self.idProperty ) self.idProperty = self._lastParamId();

    // The db layer already has a layer called 'collectionName' in the registry!
    // This store will reuse it
    var dbLayer = self.DbLayer.getLayer( self.collectionName );
    if( dbLayer ){
      
      // idProperty must match
      if( self.idProperty != dbLayer.idProperty ){
        throw( new Error("When reusing a db layer, idProperties must match.", self.storeName, 'is reusing', dbLayer.table ) );
      }

      // TODO: check that `nested`, `schema` `hardLimitOnQueries`, `sortableFields`
      // are NOT defined in the direct prototype
      //if( self.__proto__.hasOwnProperty( 'schema' ){
      //  throw( new Error("When reusing a db layer, schema must not be defined in derived constructor.", self.storeName, 'is reusing', dbLayer.table ) );
      //}
      //if( self.__proto__.hasOwnProperty( 'nested' ){
      //  throw( new Error("When reusing a db layer, nested must not be defined in derived constructor.", self.storeName, 'is reusing', dbLayer.table ) );
      //}
      //if( self.__proto__.hasOwnProperty( 'hardLimitOnQueries' ){
      //  throw( new Error("When reusing a db layer, hardLimitOnQueries must not be defined in derived constructor.", self.storeName, 'is reusing', dbLayer.table ) );
      //}
      //if( self.__proto__.hasOwnProperty( 'sortableFields' ){
      //  throw( new Error("When reusing a db layer, sortableFields must not be defined in derived constructor.", self.storeName, 'is reusing', dbLayer.table ) );
      //}

      self.schema = dbLayer.schema;
      self.nested = dbLayer.nested;
      self.hardLimitOnQueries = dbLayer.hardLimitOnQueries;

      self.dbLayer = dbLayer;
    }

    // The schema must be defined
    if( self.schema == null ){
      throw( new Error("You must define a schema") );
    }


    //                   *** SETTING THE SCHEMAS ***


    // STEP #1: COMPLETE THE DB SCHEMA WITH PARAMIDs
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
   
    // STEP #2: MAKE SURE onlineSearchSchema IS DEFINED AND GOOD
    //          If not there, create it as a copy of `schema` where `searchable is there.
    //          If there, make sure that every item has `searchable`

    // If onlineSearchSchema wasn't defined, then set it as a copy of the schema where
    // fields are searchable, EXCLUDING the paramIds fields.
    if( self.onlineSearchSchema == null ){

      var onlineSearchSchemaStructure = { };
      for( var k in self.schema.structure ){
        if( self.schema.structure[ k ].searchable && self.paramIds.indexOf( k ) ===  -1  ){
          onlineSearchSchemaStructure[ k ] = self.schema.structure[ k ];
        }
      }
      self.onlineSearchSchema = new self.schema.constructor( onlineSearchSchemaStructure );


    // If onlineSearchSchema WAS defined, then add `searchable` to all entries
    // Since it's a defined search schema, all of its entries need to be
    // searchable regardless.
    } else {

      for( var k in self.onlineSearchSchema.structure ){
        self.onlineSearchSchema.structure[ k ].searchable = true;
      }
    }

    // STEP #3: COMPLETE THE DB SCHEMA WITH onlineSearchSchema ENTRIES
    //          For every entry in onlineSearchSchema, add `searchable` to 
    //          corresponding entry in `schema`

    // Make sure that, for every entry present in onlineSearchSchema,
    // the corresponding DB-level schema is searchable
    // (unless they are paramIds, in which case there is no point. AND YES, users might
    // decide that paramIds are in onlineSearchSchema, it already happens in Hotplate)
    for( var k in self.onlineSearchSchema.structure ){
    
      var entry = self.onlineSearchSchema.structure[ k ];

      // Simple case: no `searchOptions`. So, the search target is 
      // the same as `k`.
      if( typeof( entry.searchOptions ) === 'undefined' ){

        if( self.paramIds.indexOf( k ) === -1 ){
          if( self.schema.structure[ k ] ) self.schema.structure[ k ].searchable = true;
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

          if( self.schema.structure[ fieldName ]) {
            self.schema.structure[ fieldName ].searchable = true;
          }

        });

      }
    }

    //                *** DONE: SETTING THE SCHEMAS ***

    // If dbLayer didn't exist already, then create one (using the passed schema, nested, idProperty )
    if( ! dbLayer ){
      var layerOptions = {
        schema: self.schema,
        nested: self.nested,
        idProperty: self.idProperty,
        schemaError: self.UnprocessableEntityError,
        hardLimitOnQueries: self.hardLimitOnQueries,
        children: true,
      };
      if( self.position ){
        layerOptions.positionField = '__position';
        layerOptions.positionBase = self.paramIds.slice( 1, -1 );
      }

      // Actually create the layer with the given parameters
      self.dbLayer = new self.DbLayer( self.collectionName, layerOptions );
    }

    // TODO: Check that each entry in self.sortableFields is actually marked as "searchable" in
    // self.schema; otherwise, stop with an error. This is important as any sortable field MUST
    // be searchable

    Store.registry[ self.storeName ] = self;

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
    });
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


  execAllDbFetch: function( request, cb ){

    var self = this;

    // Make up the filter, based on the store's IDs (used as filters).
    var selector = {};

    // Make up the selector.
    // Remote requests need to have the full filter based on request.params. Local ones
    // only have to have (and I mean HAVE TO) the idProperty
    if( request.remote ){
       self._enrichSelectorWithParams( selector, request.params );
    } else {
      selector = { conditions: { and: [ { field: self.idProperty, type: 'eq', value: request.params[ self.idProperty ] } ] } };
    }

    // Make the database call 
    self.dbLayer.select( selector, { children: true }, function( err, docs ){
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

  execPostDbInsertNoId: function( request, generatedId, cb ){
   
    var self = this;

    var record = {};

    // Make up the `record` variable, based on the passed `body`
    for( var k in request.body ) record[ k ] = request.body[ k ];
    delete record._children;

    // Obsoleted by self._enrichBodyWithParamIdsIfRemote
    // Add param IDs to the record that is being written
    //self.paramIds.forEach( function( paramId ){
    //  if( typeof( request.params[ paramId ] ) !== 'undefined' ){
    //    record[ paramId ] = request.params[ paramId ];
    //  }
    //});

    // The last parameter is missing since it
    // wasn't passed: assign an ObjectId to it
    record[ self.idProperty ] = generatedId;

    self.dbLayer.insert( record, { returnRecord: true, skipValidation: true, children: true }, cb );

  },

  execPutDbUpdate: function( request, cb ){

    var self = this;
    var updateObject = {};

    // Make up the filter, based on the store's IDs (used as filters).
    var selector = {};

    // Make up the selector.
    // Remote requests need to have the full filter based on request.params. Local ones
    // only have to have (and I mean HAVE TO) the idProperty
    if( request.remote ){
       self._enrichSelectorWithParams( selector, request.params );
    } else {
      selector = { conditions: { and: [ { field: self.idProperty, type: 'eq', value: request.params[ self.idProperty ] } ] } };
    }


    // Make up the `updateObject` variable, based on the passed `body`
    for( var i in request.body ) updateObject[ i ] = request.body[ i ];
    delete updateObject._children;

    // Obsoleted by self._enrichBodyWithParamIdsIfRemote
    // Add param IDs to the record that is being written (updated)
    //self.paramIds.forEach( function( paramId ){
    //  if( typeof( request.params[ paramId ] ) !== 'undefined' ){
    //    updateObject[ paramId ] = request.params[ paramId ];
    //  }
    //});

    // Only delete unset fields if there is no piggyField.
    // If piggyField is there, this is a single-record update
    var deleteUnsetFields = ! self.piggyField;

    self.dbLayer.update( selector, updateObject, { deleteUnsetFields: deleteUnsetFields, multi: false, skipValidation: true }, function( err, howMany ){
      if( err ){
        cb( err );
      } else {

        self.dbLayer.select( selector, { children: true }, function( err, docs ){
          if( err ){
            cb( err );
          } else {
            if( docs.length === 0 ){
              cb( null, null );
            } else if( docs.length !== 1 ){

              cb( new self.ServiceUnavailableError({
                message: "dbLayer.update updated more than 1 record",
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
      }
    });
  },


  execPutDbInsert: function( request, cb ){
  
    var self = this;

    var record = {};

    // Make up the `record` variable, based on the passed `body`
    for( var k in request.body ) record[ k ] = request.body[ k ];
    delete request.body._children;

    // Obsoleted by self._enrichBodyWithParamIdsIfRemote
    // Add param IDs to the record that is being written
    //self.paramIds.forEach( function( paramId ){
    //  if( typeof( request.params[ paramId ] ) !== 'undefined' ){
    //    record[ paramId ] = request.params[ paramId ];
    //  }
    //});

    self.dbLayer.insert( record, { children: true, returnRecord: true, skipValidation: true }, cb );

  },


  execDeleteDbDelete: function( request, cb ){

    var self = this;
    var selector = {};

    // Make up the selector.
    // Remote requests need to have the full filter based on request.params. Local ones
    // only have to have (and I mean HAVE TO) the idProperty
    if( request.remote ){
       self._enrichSelectorWithParams( selector, request.params );
    } else {
      selector = { conditions: { and: [ { field: self.idProperty, type: 'eq', value: request.params[ self.idProperty ] } ] } };
    }

    self.dbLayer.delete( selector, { multi: false, skipValidation: true }, cb );
  },

  _queryMakeSelector: function( remote, filters, sort, ranges, cb ){

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


      // There is a slim chance that  self.onlineSearchSchema.structure[ filterField ] is not there:
      // it happens in case the request is from API and it required a field available
      // in the main schema but NOT in the search schema
      var searchable = self.onlineSearchSchema.structure[ filterField ] && self.onlineSearchSchema.structure[ filterField ].searchable;
      var searchOptions = self.onlineSearchSchema.structure[ filterField ] && self.onlineSearchSchema.structure[ filterField ].searchOptions;

      if( searchable || !remote ) {

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

      console.log("CONDITIONS: ", conditions );

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
      *   LOCAL: user sets options.filters, options.sort, options.ranges, options.skipHardLimitOnQueries

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
    // options.putBefore and options.putDefaultPosition
    if( mn === 'Put' || mn === "Post" ){

      // The header `x-put-default-position` always wins
      if( typeof( req.headers[ 'x-put-default-position' ]) !== 'undefined'){

        // Set options.putDefaultPosition depending on passed header. Default is `false`
        if( req.headers[ 'x-put-default-position' ] === 'start' ){
          options.putDefaultPosition = 'start';
        } else {
          options.putDefaultPosition = 'end';
        }

      // There is no `x-put-default-position`: see if x-put-before is set
      // and if it is, set options.putBefore
      // NOTE: in the server context, putBefore ALWAYS needs to be an id, and NEVER null
      } else {

        if( typeof( req.headers[ 'x-put-before' ] ) !== 'undefined' )
          options.putBefore = req.headers[ 'x-put-before' ];

      }

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

      q.split( '&' ).forEach( function( item ) {

        var tokens = item.split('=');
        var tokenLeft = tokens[0];
        var tokenRight = tokens[1];

        if(tokenLeft === 'sortBy'){
          subTokens = tokenRight.split(',');
          for( i = 0; i < subTokens.length; i++ ){

            subToken = subTokens[ i ];
            subTokenClean = subToken.replace( '+', '' ).replace( '-', '' );

            if( self.sortableFields.indexOf( subTokenClean ) === -1 ){
              throw( new Error("Field selected for sorting invalid: " + subTokenClean) );
            }

            if( subTokens[ i ][ 0 ] === '+' || subTokens[ i ][ 0 ] === '-' ){
              var sortDirection = subTokens[ i ][ 0 ] == '-' ? -1 : 1;
              sortField = subTokens[ i ].replace( '+', '' ).replace( '-', '' );
              sortObject[ sortField ] = sortDirection;
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
      if( (hr = req.headers['range']) && ( tokens = hr.match(/items=([0-9]+)\-(([0-9]+)||(Infinity))$/))  ){
        rangeFrom = tokens[1] - 0;
        rangeTo = tokens[2] - 0;
        if( rangeTo == 'Infinity' ){
          return ({
            from: rangeFrom
          })
        } else {

          limit =  rangeTo - rangeFrom + 1;

          return( {
            from: rangeFrom,
            to: rangeTo,
            limit:  limit,
          });

        }
      } 

      // Range headers not found or not valid, return null 
      return null;
    }


    function parseFilters( req ){

      var url_parts = url.parse( req.url, false );
      var q = url_parts.query || '';
      var result;

      result = querystring.decode( q );
      delete result.sortBy;

      return result;
    }


      /*
      // Original code where I parsed the query string manually.

      var tokens, tokenLeft, tokenRight;
      var failedCasts;


      q.split( '&' ).forEach( function( item ) {


        tokens = item.split('=');
        tokenLeft  = tokens[0];
        tokenRight = tokens[1];

        // Only add it to the filter if it's in the schema AND if it's searchable
        //if( tokenLeft != 'sort' && ( ! request.remote || ( self.onlineSearchSchema.structure[ tokenLeft ] && self.onlineSearchSchema.structure[ tokenLeft ].searchable )) ) {

        // MERC: This is the original one. I took it out as there is validation on this happening very soon
        //if( tokenLeft != 'sortBy' && self.onlineSearchSchema.structure[ tokenLeft ] && self.onlineSearchSchema.structure[ tokenLeft ].searchable  ) {

        if( tokenLeft != 'sortBy'  ) {
          result[ tokenLeft ] = tokenRight;

        }
      });
*/

      
  },

  execGetDbQuery: function( request, next ){

    var self = this;
    var cursor;
    var dbLayerOptions = {};

    // If options.delete was on or if it's set at store-level
    // pass {delete: true } to the db layer
    if( request.options.delete || self.deleteAfterGetQuery ){
      dbLayerOptions.delete = true;
    }

    // Pass on skipHardLimitOnQueries to the dbLayer
    dbLayerOptions.skipHardLimitOnQueries = request.options.skipHardLimitOnQueries;

    // Children is always true
    dbLayerOptions.children = true;

    // Paranoid checks
    if( typeof( request.options.sort ) === 'undefined' || request.options.sort === null ) request.options.sort = {}; 
    if( typeof( request.options.ranges ) === 'undefined' || request.options.ranges === null ) request.options.ranges = {}; 

    // Sort by self.positionField if sort is empty and self.positionField is defined
    //if( Object.keys( options.sort ).length === 0 && self.positionField ){
    //  options.sort[ self.positionField ] = 1;
    //}


    console.log("FILTERS: ", request.options.filters );

    self._queryMakeSelector( request.remote, request.options.filters, request.options.sort, request.options.ranges, function( err, selector ){
      if( err ){
        next( err );
      } else {

        if( request.remote) self._enrichSelectorWithParams( selector, request.params );

        // Run the select based on the passed parameters
        self.dbLayer.select( selector, dbLayerOptions, next );
      }
    });

  },



  // ****************************************************
  // *** INTERNAL FUNCTIONS, DO NOT TOUCH
  // ****************************************************


  _extrapolateDocAndprepareBeforeSendAll: function( request, docs, cb ){

    var self = this;

    var changeFunctions = [];
    docs.forEach( function( fullDoc, index ){

      changeFunctions.push( function( callback ){

        self.extrapolateDoc(  request, fullDoc, function( err, doc ){
          if( err ){
            callback( err, null );
          } else {

            self.prepareBeforeSend( request, doc, function( err ){
              if( err ){
                callback( err, null );
              } else {
                docs[ index ] = doc;
                callback( null, null );
              }
            });

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
  // paramsSchema.
  _checkParamIds: function( request, skipIdProperty, next ){

    var self = this;
    var errors = [];

    // Params is empty: nothing to do, optimise a little
    if( request.params.length === 0 ) return cb( null );

    // Check that ALL paramIds do belong to the schema
    self.paramIds.forEach( function( k ) {
      if( typeof( self.schema.structure[ k ] ) === 'undefined' ){
        throw new Error( 'This paramId must be in schema: ' + k);
      }
    });

    // If it's a remote request, check that _all_ paramIds are in params
    // (Local API requests can avoid passing paramIds)
    if( request.remote ){
      self.paramIds.forEach( function( k ) {

        // "continue" if id property is to be skipped
        if( skipIdProperty && k == self.idProperty ) return;

        // Required paramId not there: puke!
        if( typeof( request.params[ k ] ) === 'undefined' ){
          errors.push( { field: k, message: 'Field required in the URL: ' + k } ); 
        }
      });
      // If one of the key fields was missing, puke back
      if( errors.length ) return next( new self.BadRequestError( { errors: errors } ) );
    };


    // Prepare skipParams and skipCast, depending on skipIdProperty
    var skipParams = {};
    var skipCast = [ ];
    if( skipIdProperty ){
      skipParams[ self.idProperty ] = [ 'required' ];
      skipCast.push( self.idProperty );
    }

    // Validate request.params
    self.schema.validate( request.params, { onlyObjectValues: true, skipParams: skipParams, skipCast: skipCast }, function( err, params, errors ){

      if( err ){
        next( err );
      } else {

        // There was a problem: return the errors
        if( errors.length ){
          next( new self.BadRequestError( { errors: errors } ) );
        } else {

          // Make sure request.params contains cast values
          request.params = params;

          next( null );
        }
      }
    });

  },

  _sendErrorOnErr: function( request, err, next, cb ){
    if( err ) {
      this._sendError( request, next, err );
    } else {
      cb();
    }
  },

  _sendError: function( request, next, error ){

    var self = this;

    // It's a local call: simply call the callback passed by the caller
    if( ! request.remote ){
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
          request._res.send( error.httpError, responseBody );
        }
      break;

    }
 
    self.logError( error );
  },

  // ****************************************************
  // *** METHOD FUNCTIONS - THE REAL DANCE STARTS HERE
  // ****************************************************

  _checkPermissionsProxy: function( request, action, doc, fulldoc, cb ){

    // It's an API request: permissions are totally skipped
    if( !request.remote ) return cb( null, true );

    // Call the right function
    switch( action ){
      case 'PutNew':
      case 'Post':
      case 'GetQuery':
        this[ 'checkPermissions' + action ]( request, cb );
      break;

      case 'PutExisting':
      case 'Get':
      case 'Delete':
        this[ 'checkPermissions' + action ]( request, doc, fulldoc, cb );
      break;
    }

  },

  _makePost: function( request, next ){

    var self = this;

    if( typeof( next ) !== 'function' ) next = function(){};

    // Check that the method is implemented
    if( ! self.handlePost && request.remote ){
      return self._sendError( request, next, new self.NotImplementedError( ) );
    }

    // Check the IDs
    self._checkParamIds( request, true, function( err ){  
      if( err ) return self._sendError( request, next, err );

      self.prepareBody( request, request.body, 'post', function( err ){
        if( err ) return self._sendError( request, next, err );

        var skipParamsObject = {};
        skipParamsObject[ self.idProperty ] = [ 'required' ];
        self._enrichBodyWithParamIdsIfRemote( request );

        // Delete _children which mustn't be here regardless
        delete request.body._children;

        self.schema.validate( request.body, { skipParams: skipParamsObject, skipCast: [ self.idProperty ]  }, function( err, body, errors ){
          if( err ) return self._sendError( request, next, err );

          if( self.remote ){
            // Protected field are not allowed here
            for( var field in request.body ){
              if( self.schema.structure[ field ].protected && typeof( request.body[ field ] ) !== 'undefined'){
                errors.push( { field: field, message: 'Field not allowed because protected: ' + field + ' in ' + self.storeName } );
              }
            } 
          }

          request.body = body;

          if( errors.length ) return self._sendError( request, next, new self.UnprocessableEntityError( { errors: errors } ) );
 
          self.postValidate( request, body, 'post', function( err ){
            if( err ) return self._sendError( request, next, err );
  
            // Actually check permissions
            self._checkPermissionsProxy( request, 'Post', null, null, function( err, granted ){
              if( err ) return self._sendError( request, next, err );
            
              if( ! granted ) return self._sendError( request, next, new self.ForbiddenError() );
            
              // Clean up body from things that are not to be submitted
              self.schema.cleanup( request.body, 'doNotSave' );
            
              self.schema.makeId( request.body, function( err, generatedId){
                if( err ) return self._sendError( request, next, err );
                                
                self.execPostDbInsertNoId( request, generatedId, function( err, fullDoc ){
                  if( err ) return self._sendError( request, next, err );

                  self.reposition( fullDoc, request.options.putBefore, request.options.putDefaultPosition, false, function( err ){
                    if( err ) return self._sendError( request, next, err );

                    self.extrapolateDoc( request, fullDoc, function( err, doc) {
                      if( err ) return self._sendError( request, next, err );
          
                      // Remote request: set headers, and send the doc back (if echo is on)
                      if( request.remote ){
                
                        // Set the Location header if it was a remote request
                        request._res.setHeader( 'Location', request._req.originalUrl + doc[ self.idProperty ] );

                        if( self.echoAfterPost ){
      
                          self.prepareBeforeSend( request, doc, function( err ){
                            if( err ) return self._sendError( request, next, err );
                
                            self.afterPost( request, doc, fullDoc, function( err ){
                              if( err ) return self._sendError( request, next, err );
           
                              request._res.json( 201, doc );
           
                            }) 
                          }) 
    
                        } else {
                
                          self.afterPost( request, doc, fullDoc, function( err ){
                            if( err ) return self._sendError( request, next, err );
 
                            //request._res.send( 204, '' );
                            request._res.send( 201, '' );

                          });
                
                        }
                
                      // Local request: simply return the doc to the asking function
                      } else {
              
                        self.prepareBeforeSend( request, doc, function( err ){
                          if( err ) return self._sendError( request, next, err );
          
                          self.afterPost( request, doc, fullDoc, function( err ){
                            if( err ) return self._sendError( request, next, err );
            
                            next( null, doc );

                          });
                        });
                      } 
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  },

  _enrichBodyWithParamIdsIfRemote: function( request ){

    var self = this;

    if( request.remote ){
      self.paramIds.forEach( function( paramId ){
        if( typeof( request.params[ paramId ] ) !== 'undefined' ){
          request.body[ paramId ] = request.params[ paramId ];
        }
      });
    }
  },

  _makePut: function( request, next ){

    var self = this;
    var overwrite;

    if( typeof( next ) !== 'function' ) next = function(){};

    // Check that the method is implemented
    if( ! self.handlePut && request.remote ){
      return self._sendError( request, next, new self.NotImplementedError( ) );
    }

    /* CHUNK #44 */


    // Check the IDs.
    self._checkParamIds( request, false, function( err ){  
      if( err ) return self._sendError( request, next, err );

      self.prepareBody( request, request.body, 'put', function( err ){
        if( err ) return self._sendError( request, next, err );

        self._enrichBodyWithParamIdsIfRemote( request );

        // Delete _children which mustn't be here regardless
        delete request.body._children;

        self.schema.validate( request.body, function( err, body, errors ) {
          if( err ) return self._sendError( request, next, err );

          if( self.remote){
            // Protected field are not allowed here
            for( var field in request.body ){
              if( self.schema.structure[ field ].protected && typeof( request.body[ field ] ) !== 'undefined'){
                errors.push( { field: field, message: 'Field not allowed because protected: ' + field + ' in ' + self.storeName } );
              }
            } 
          }

          request.body = body;
        
          if( errors.length ) return self._sendError( request, next, new self.UnprocessableEntityError( { errors: errors } ) );
   
          self.postValidate( request, body, 'put', function( err ){
            if( err ) return self._sendError( request, next, err );
 
            // Fetch the doc
            self.execAllDbFetch( request, function( err, fullDoc ){
              if( err ) return self._sendError( request, next, err );
              
              // Check the 'overwrite' option
              if( typeof( request.options.overwrite ) !== 'undefined' ){
                if( fullDoc && ! request.options.overwrite ){
                  self._sendError( request, next, new self.PreconditionFailedError() );
                } else if( !fullDoc && request.options.overwrite ) {
                  self._sendError( request, next, new self.PreconditionFailedError() );
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
                  self._checkPermissionsProxy( request, 'PutNew', null, null, function( err, granted ){
                    if( err ) return self._sendError( request, next, err );
            
                    if( ! granted ) return self._sendError( request, next, new self.ForbiddenError() );

                    // Clean up body from things that are not to be submitted
                    // if( self.schema ) self.schema.cleanup( body, 'doNotSave' );
                    self.schema.cleanup( request.body, 'doNotSave' );
            
                    // Paranoid check
                    // Make sure that the id property in the body does match
                    // the one passed as last parameter in the list of IDs
                    request.body[ self.idProperty ] = request.params[ self.idProperty ];
                    
                    self.execPutDbInsert( request, function( err, fullDoc ){
                      if( err ) return self._sendError( request, next, err );
            
                        self.reposition( fullDoc, request.options.putBefore, request.options.putDefaultPosition, false, function( err ){

                        if( err ) return self._sendError( request, next, err );

                        self.extrapolateDoc( request, fullDoc, function( err, doc) {
                          if( err ) return self._sendError( request, next, err );
              
                          // Remote request: set headers, and send the doc back (if echo is on)
                          if( request.remote ){
                  
                            // Set the Location header if it was a remote request
                            request._res.setHeader( 'Location', request._req.originalUrl );
  
                            if( self.echoAfterPutNew ){
           
                              self.prepareBeforeSend( request, doc, function( err ){
                                if( err ) return self._sendError( request, next, err );
  
                                self.afterPutNew( request, doc, fullDoc, request.options.overwrite, function( err ){
                                  if( err ) return self._sendError( request, next, err );
   
                                  request._res.json( 201, doc );
                                });
                              });
                            } else {
                  
                              self.afterPutNew( request, doc, fullDoc, request.options.overwrite, function( err ){
                                if( err ) return self._sendError( request, next, err );
  
                                request._res.send( 201, '' );
            
                              });
                            }
              
                          // Local request: simply return the doc to the asking function
                          } else {
                            self.prepareBeforeSend( request, doc, function( err ){
                              if( err ) return self._sendError( request, next, err );
              
                              self.afterPutNew( request, doc, fullDoc, request.options.overwrite, function( err ){
                                if( err ) return self._sendError( request, next, err );
              
                                next( null, doc );
                              });
                            });
                          }
                        });
                      });

                    });
                  });
           
 
                // It's an EXISTING doc: it will need to be an update, _and_ permissions will be
                // done on inputted data AND existing doc
                } else {
        
                  self.extrapolateDoc( request, fullDoc, function( err, doc) {
                    if( err ) return self._sendError( request, next, err );
            
                    // Actually check permissions
                    self._checkPermissionsProxy( request, 'PutExisting', doc, fullDoc, function( err, granted ){
                      if( err ) return self._sendError( request, next, err );
               
                      if( ! granted ) return self._sendError( request, next, new self.ForbiddenError() );
                
                      // Clean up body from things that are not to be submitted
                      // if( self.schema ) self.schema.cleanup( body, 'doNotSave' );
                      self.schema.cleanup( request.body, 'doNotSave' );
              
                      self.execPutDbUpdate( request, function( err, fullDocAfter ){
                        if( err ) return self._sendError( request, next, err );
          
                          self.reposition( fullDoc, request.options.putBefore, request.options.putDefaultPosition, true, function( err ){

                            if( err ) return self._sendError( request, next, err );
  
       
                          self.extrapolateDoc( request, fullDocAfter, function( err, docAfter ) {
                            if( err ) return self._sendError( request, next, err );
     
                            // Remote request: set headers, and send the doc back (if echo is on)
                            if( request.remote ){
                  
                              // Set the Location header if it was a remote request
                              request._res.setHeader( 'Location', request._req.originalUrl );
                     
                              if( self.echoAfterPutExisting ){
                      
                                self.prepareBeforeSend( request, docAfter, function( err ){
                                  if( err ) return self._sendError( request, next, err );
                 
                                  self.afterPutExisting( request, doc, fullDoc, docAfter, fullDocAfter, request.options.overwrite, function( err ) {
                                    if( err ) return self._sendError( request, next, err );
      
                                    request._res.json( 200, docAfter );
  
                                  });
                                });
              
                              } else {
                  
                                self.afterPutExisting( request, doc, fullDoc, docAfter, fullDocAfter, request.options.overwrite, function( err ) {
                                  if( err ) return self._sendError( request, next, err );
                
                                  request._res.send( 200, '' );
                                  //res.send( 204, '' );
             
                                });
                              }
                  
                            // Local request: simply return the doc to the asking function
                            } else {
                              self.prepareBeforeSend( request, docAfter, function( err ){
                                if( err ) return self._sendError( request, next, err );
      
      
                                self.afterPutExisting( request, doc, fullDoc, docAfter, fullDocAfter, request.options.overwrite, function( err ) {
                                  if( err ) return self._sendError( request, next, err );
  
                                  next( null, docAfter );
  
                                });
                              });
                            }
                         });
                       });
                     });

                   });
                 });
                } // Existing or new doc
              } // continueAfterFetch
 
            });
          });
        });
      });
    });

  },

  // Helper function for _makeGetQuery
  _validateSearchFilter: function( request, filters, options, cb ){

    var self = this;

    // If it's a remote call, then simply validate using the onlineSearchSchema
    if( request.remote ){
      return self.onlineSearchSchema.validate( filters, options, cb);
    }

    // If it's a local call, validate using a new schema made up with the onlineSearchSchema AND
    // the common schema merged together
    var schemaStructure = {};
    for( var k in self.onlineSearchSchema.structure ) schemaStructure[ k ] = self.onlineSearchSchema.structure[ k ];
    for( var k in self.schema.structure ) schemaStructure[ k ] = schemaStructure[ k ] || self.schema.structure[ k ];

    var newSchema = new self.onlineSearchSchema.constructor( schemaStructure );
    newSchema.validate( filters, options, cb );
  },

  _makeGetQuery: function( request, next ){

    var self = this;
    var sort, range, filters;

    if( typeof( next ) !== 'function' ) next = function(){};

    // Check that the method is implemented
    if( ! self.handleGetQuery && request.remote ){
      return self._sendError( request, next, new self.NotImplementedError( ) );
    }
  
    // Check the IDs. If there is a problem, it means an ID is broken:
    // return a BadRequestError
    self._checkParamIds( request, true, function( err ){  
      if( err ) return self._sendError( request, next, err );
    
      self._checkPermissionsProxy( request, 'GetQuery', null, null, function( err, granted ){
        if( err ) return self._sendError( request, next, err );
    
        if( ! granted ) return self._sendError( request, next, new self.ForbiddenError() );
    
        self._validateSearchFilter( request, request.options.filters, { onlyObjectValues: true }, function( err, filters, errors ){
          if( err ) return self._sendError( request, next, err );

          // Actually assigning cast and validated filters to `options`
          request.options.filters = filters;

          // Errors in casting: give up, run away
          if( errors.length ) return self._sendError( request, next, new self.BadRequestError( { errors: errors } ));
        
          self.execGetDbQuery( request, function( err, queryDocs, total, grandTotal ){
            if( err ) return self._sendError( request, next, err );
       
            self._extrapolateDocAndprepareBeforeSendAll( request, queryDocs, function( err ){
              if( err ) return self._sendError( request, next, err );
        
              self.afterGetQuery( request, queryDocs, function( err ) {
                if( err ) return self._sendError( request, next, err );

                // Remote request: set headers, and send the doc back (if echo is on)
                if( request.remote ){

                  if( request.options.ranges ){
                    var from, to, of;
                    from = total ? request.options.ranges.from : 0;
                    to = total ? request.options.ranges.from + total - 1 : 0 ;
                    of = grandTotal;
                    request._res.setHeader('Content-Range', 'items ' + from + '-' + to + '/' + of );
                  }
                  request._res.json( 200, queryDocs );

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
  },


  _makeGet: function( request, next ){

    var self = this;

    if( typeof( next ) !== 'function' ) next = function(){};

    // Check that the method is implemented
    if( ! self.handleGet && request.remote ){
      return self._sendError( request, next, new self.NotImplementedError( ) );
    }

    // Check the IDs
    self._checkParamIds( request, false, function( err ){  
      if( err ) return self._sendError( request, next, err );

      // Fetch the doc.
      self.execAllDbFetch( request, function( err, fullDoc ){
        if( err ) return self._sendError( request, next, err );
    
        if( ! fullDoc ) return self._sendError( request, next, new self.NotFoundError());
    
        self.extrapolateDoc( request, fullDoc, function( err, doc) {
          if( err ) return self._sendError( request, next, err );
    
          // Check the permissions 
          self._checkPermissionsProxy( request, 'Get', doc, fullDoc, function( err, granted ){
            if( err ) return self._sendError( request, next, err );
        
            if( ! granted ) return self._sendError( request, next, new self.ForbiddenError() ); 
        
            // "preparing" the doc. The same function is used by GET for collections 
            self.prepareBeforeSend( request, doc, function( err ){
              if( err ) return self._sendError( request, next, err );
        
              self.afterGet( request, doc, fullDoc, function( err ) {
                if( err ) return self._sendError( request, next, err );
                    
                // Remote request: set headers, and send the doc back (if echo is on)
                if( request.remote ){
        
                  // Send "prepared" doc
                  request._res.json( 200, doc );
        
                  // Local request: simply return the doc to the asking function
                } else {
                   next( null, doc );
                }
        
              });
            });
          });
        });
      });
    });
  },


  _makeDelete: function( request, next ){

    var self = this;
    
    if( typeof( next ) !== 'function' ) next = function(){};
  
    // Check that the method is implemented
    if( ! self.handleDelete && request.remote ){
      return self._sendError( request, next, new self.NotImplementedError( ) );
    }
  
    // Check the IDs
    self._checkParamIds( request, false, function( err ){ 
      if( err ) return self._sendError( request, next, err );
    
      // Fetch the doc.
      self.execAllDbFetch( request, function( err, fullDoc ){
        if( err ) return self._sendError( request, next, err );
    
        if( ! fullDoc ) return self._sendError( request, next, new self.NotFoundError());
    
        self.extrapolateDoc( request, fullDoc, function( err, doc) {
          if( err ) return self._sendError( request, next, err );
        
          // Check the permissions 
          self._checkPermissionsProxy( request, 'Delete', doc, fullDoc, function( err, granted ){
            if( err ) return self._sendError( request, next, err );
        
            if( ! granted ) return self._sendError( request, next, new self.ForbiddenError() );
        
            // Actually delete the document
            self.execDeleteDbDelete( request, function( err ){
              if( err ) return self._sendError( request, next, err );
        
              // Remote request: send a 204 (contents) or 201 (no contents) back
              if( request.remote ){

                if( self.echoAfterDelete ){

                  self.prepareBeforeSend( request, doc, function( err ){
                    if( err ) return self._sendError( request, next, err );
        
                    self.afterDelete( request, doc, fullDoc, function( err ){
                      if( err ) return self._sendError( request, next, err );
   
                      request._res.json( 201, doc );
   
                    }) 
                  }) 

                } else {
        
                  self.afterDelete( request, doc, fullDoc, function( err ){
                    if( err ) return self._sendError( request, next, err );

                    request._res.send( 204, '' );
                    //request._res.send( 201, '' );

                  });
        
                }
                
              // Local request: simply return the doc's ID to the asking function
              } else {
                next( null, doc );
              }

            });
          });
        });
      });
    });
  },



// ****************************************************
// *** HTTP REQUEST HANDLER
// ****************************************************
  
  getRequestHandler: function( action ){

    var self = this;

    if( [ 'Get', 'GetQuery', 'Put', 'Post', 'Delete' ].indexOf( action ) === -1 ){
      throw( new Error("action can be Get, GetQuery, Put, Post, Delete") );
    }

    return function( req, res, next ){

      var request = new Object();
  
      // It's definitely remote
      request.remote = true;

      // Sets the request's _req and _res variables
      request._req = req;
      request._res = res;

      // Set the params and body options, copying them from `req`
      request.params = {}; for( var k in req.params) request.params[ k ] = req.params[ k ];
      request.body = {}; for( var k in req.body) request.body[ k ] = req.body[ k ];

      // Since it's an online request, options are set by "req"
      // This will set things like ranges, sort options, etc.
      try {
        request.options = self._initOptionsFromReq( action, req );
      } catch( e ){
        return next( e );
      }

      // The "delete" option can apply to GetQuery
      if( action === 'GetQuery' ){
        request.options.delete = !!self.deleteAfterGetQuery;
      }

      if(Store.artificialDelay ) {
        setTimeout( function(){
          // Actually run the request
          self['_make' + action ]( request, next );
        }, Store.artificialDelay );
      } else {
        self['_make' + action ]( request, next );
      }

    }
  },
 
  setAllRoutes: function( app, urlParameter ){

    var url = urlParameter || this.publicURL;
    var idName;

    // Public URL must be set
    if( ! url ){
      throw( new Error( "setAllRoutes must be called on a store with a public URL" ) );
    }

    // OK, everything is dandy: work out base URL and id, and create the Express routes
    var idName = url.match( /:\w*$/ )[0];
    url = url.replace( /:\w*$/, '');

    // Make entries in "app", so that the application
    // will give the right responses
    app.get(      url + idName, this.getRequestHandler( 'Get' ) );
    app.get(      url,          this.getRequestHandler( 'GetQuery') );
    app.put(      url + idName, this.getRequestHandler( 'Put') );
    app.post(     url,          this.getRequestHandler( 'Post') );
    app.delete(   url + idName, this.getRequestHandler( 'Delete') );
  },



  // ****************************************************
  // *** API (REST FUNCTIONS AS OBJECT METHODS)
  // ****************************************************


  apiGet: function( id, options, next){

    // Make `options` argument optional
    var len =  arguments.length;

    if( len == 2 ) { next = options; options = {}; };

    var request = new Object();

    request.remote = false;
    request.body = {};
    request.options = options;

    // Make up "params" to be passed to the _makeGet function
    request.params = {};
    //request.params[ this._lastParamId() ] = id;
    request.params[ this.idProperty ] = id;

    // Actually run the request
    this._makeGet( request, next );

  },



  apiGetQuery: function( options, next ){


    // Make up the request
    var request = new Object();

    request.remote = false;
    request.body = {};
    request.params = {};
    request.options = options;

    // Actually run the request
    this._makeGetQuery( request, next );

  },

  apiPut: function( id, body, options, next ){

    var Class = this;

    // Make `options` argument optional
    var len =  arguments.length;
    if( len == 3 ) { next = options; options = {}; };

    // Make up the request
    var request = new Object();
    request.remote = false;
    request.body = body;
    request.options = options;

    delete body._children;

    // Sets only idProperty in the params hash. Note that
    // you might well decide to pass the whole object in body, and
    // pass `null` as the object ID: in that case, this function
    // will sort out `params` with the `id` set
    request.params = {};
    if( id !== null ){
      request.params[ this.idProperty ] = id;
      request.body[ this.idProperty ] = id;
    } else {
      var idInBody = body[ this.idProperty ];
      if( typeof( idInBody ) !== 'undefined'){
        request.params[ this.idProperty ] = body[ this.idProperty ];
      } else {
        throw( new Error("When calling Store.Put with an ID of null, id MUST be in body") );
      }
    }

    // Actually run the request
    this._makePut( request, next );
  },

  apiPost: function( body, options, next ){

    // Make `options` argument optional
    var len =  arguments.length;
    if( len == 2 ) { next = options; options = {}; };

    // Make up the request
    var request = new Object();
    request.remote = false;
    request.body = body;
    request.options = options;
    request.params = {};

    delete body._children;

    // Actually run the request
    this._makePost( request, next );
  },


  apiDelete: function( id, options, next ){

    // Make `options` argument optional
    var len =  arguments.length;
    if( len == 2 ) { next = options; options = {}; };

    // Make up the request
    var request = new Object();
    request.body = {};
    request.options = options;

    // Make up "params" to be passed to the _makeDelete function
    request.params = {};
    //request.params[ this._lastParamId() ] = id;
    request.params[ this.idProperty ] = id;

    // Actually run the request
    this._makeDelete( request, next );
  },

 
});


// Get store from the class' registry
Store.getStore = function( storeName ){
  return Store.registry[ storeName ];
}

// Get store from the class' registry
Store.deleteStore = function( storeName ){
  delete Store.registry[ storeName ];
}


// Get all stores as a hash
Store.getAllStores = function(){
  return Store.registry;
}

// OneFieldStoreMixin, to create a one-field store based
// on a "main" parent store

Store.OneFieldStoreMixin = declare( null,  {

  // Variables that HAVE TO be set by the inherited constructor
  storeName: null,
  collectionName: null,
  publicURL: null,
  piggyField: null,

  // Only PUT and GET allowed
  handlePut: true,
  handlePost: false,
  handleGet: true,
  handleGetQuery: false,
  handleDelete: false,

  // Reset possibly overloaded function which, although inherited, wouldn't
  // make sense in a OneFieldStore context
  extrapolateDoc: function( request, fullDoc, cb ){ cb( null, fullDoc ); },
  prepareBeforeSend: function( request, doc, cb ){ cb( null ); },
  prepareBody: function( request, body, method, cb ){ cb( null ); },
  
  // Making sure unwanted methods  are not even implemented
  _makePost: function( request, next ){
    next( new Error( "Method not implemented" ));
  },
  _makeDelete: function( request, next ){
      next( new Error(" Method not implemented" ));
  },
  _makeGetQuery: function( request, next ){
    next( new Error( "Method not implemented" ));
  },

  // Implement the WANTED methods: Put and Get

  _makeGet: function( request, next ){

    var self = this;

    if( typeof( next ) !== 'function' ) next = function(){};

    // Check that the method is implemented
    if( ! self.handleGet && request.remote ){
      return self._sendError( request, next, new self.NotImplementedError( ) );
    }

    // Check the IDs
    self._checkParamIds( request, false, function( err ){  
      if( err ) return self._sendError( request, next, err );

      // Fetch the doc.
      self.execAllDbFetch( request, function( err, fullDoc ){
        if( err ) return self._sendError( request, next, err );
    
        if( ! fullDoc ) return self._sendError( request, next, new self.NotFoundError());

        // Manipulate fullDocAfter: at this point, it's the WHOLE database record,
        // whereas I only want returned paramIds AND the piggyField
        for( var field in fullDoc ){
          if( ! self.paramIds[ field ] && field != self.piggyField ) delete fullDoc[ field ];
        }

        self.extrapolateDoc( request, fullDoc, function( err, doc) {
          if( err ) return self._sendError( request, next, err );
    
          // Check the permissions 
          self._checkPermissionsProxy( request, 'Get', doc, fullDoc, function( err, granted ){
            if( err ) return self._sendError( request, next, err );
        
            if( ! granted ) return self._sendError( request, next, new self.ForbiddenError() ); 
        
            // "preparing" the doc. The same function is used by GET for collections 
            self.prepareBeforeSend( request, doc, function( err ){
              if( err ) return self._sendError( request, next, err );
        
              self.afterGet( request, doc, fullDoc, function( err ) {
                if( err ) return self._sendError( request, next, err );
                    
                // Remote request: set headers, and send the doc back (if echo is on)
                if( request.remote ){
        
                  // Send "prepared" doc
                  request._res.json( 200, doc );
        
                  // Local request: simply return the doc to the asking function
                } else {
                   next( null, doc );
                }
        
              });
            });
          });
        });
      });
    });
  },


  _makePut: function( request, next ){

    var self = this;

    if( typeof( next ) !== 'function' ) next = function(){};

    // Check that the method is implemented
    if( ! self.handlePut && request.remote ){
      return self._sendError( request, next, new self.NotImplementedError( ) );
    }

    // DETOUR: It's a reposition. Not allowed here!
    if( typeof( request.options.putBefore ) !== 'undefined' ){
      return cb( new Error("Option putBefore not allowed in OneFieldStore"));
    }
 
    // Check the IDs.

    self._checkParamIds( request, false, function( err ){  
      if( err ) return self._sendError( request, next, err );

      self.prepareBody( request, request.body, 'put', function( err ){
        if( err ) return self._sendError( request, next, err );

        self._enrichBodyWithParamIdsIfRemote( request );

        
        self.schema.validate( request.body, { onlyObjectValues: true }, function( err, body, errors ) {
          if( err ) return self._sendError( request, next, err );

          // Go through each field in body, and check that it's either
          // a paramId OR piggyField
          // After this, body will be validated with { onlyObjectValues }
          for( var field in request.body ){
            if( self.paramIds.indexOf( field ) == -1 && field != self.piggyField ){
              errors.push( { field: field, message: 'Field not allowed because not a paramId nor the piggyBack field: ' + field + ' in ' + self.storeName } );
            }
          }

          if( errors.length ) return self._sendError( request, next, new self.UnprocessableEntityError( { errors: errors } ) );

          request.body = body;
   
          self.postValidate( request, body, 'put', function( err ){
            if( err ) return self._sendError( request, next, err );
 
            // Fetch the doc
            self.execAllDbFetch( request, function( err, fullDoc ){
              if( err ) return self._sendError( request, next, err );     
           
              // OneFieldStores will only ever work on already existing records
              if( ! fullDoc ){
                return self._sendError( request, next, new self.NotFoundError());
              }         

              // Manipulate fullDoc: at this point, it's the WHOLE database record,
              // whereas I only want returned paramIds AND the piggyField
              for( var field in fullDoc ){
                if( self.paramIds.indexOf( field ) == -1 && field != self.piggyField ) delete fullDoc[ field ];
              }
              
              self.extrapolateDoc( request, fullDoc, function( err, doc) {
                if( err ) return self._sendError( request, next, err );
        

                // Actually check permissions
                self._checkPermissionsProxy( request, 'PutExisting', doc, fullDoc, function( err, granted ){
                  if( err ) return self._sendError( request, next, err );
           
                  if( ! granted ) return self._sendError( request, next, new self.ForbiddenError() );
            
                  self.execPutDbUpdate( request, function( err, fullDocAfter ){
                    if( err ) return self._sendError( request, next, err );

                    // Manipulate fullDoc: at this point, it's the WHOLE database record,
                    // whereas I only want returned paramIds AND the piggyField
                    for( var field in fullDocAfter ){
                      if( self.paramIds.indexOf( field ) == -1 && field != self.piggyField ) delete fullDocAfter[ field ];
                    }

                    self.extrapolateDoc( request, fullDocAfter, function( err, docAfter ) {
                      if( err ) return self._sendError( request, next, err );

                      // Remote request: set headers, and send the doc back (if echo is on)
                      if( request.remote ){
          
                        // Set the Location header if it was a remote request
                        request._res.setHeader( 'Location', request._req.originalUrl );
             
                        if( self.echoAfterPutExisting ){
              
                          self.prepareBeforeSend( request, docAfter, function( err ){
                            if( err ) return self._sendError( request, next, err );
         
                            self.afterPutExisting( request, doc, fullDoc, docAfter, fullDocAfter, true, function( err ) {
                              if( err ) return self._sendError( request, next, err );

                              request._res.json( 200, docAfter );

                            });
                          });
      
                        } else {
            
                          self.afterPutExisting( request, doc, fullDoc, docAfter, fullDocAfter,   request.true, function( err ) {
                            if( err ) return self._sendError( request, next, err );
        
                            request._res.send( 200, '' );
                            //res.send( 204, '' );
     
                          });
                        }
          
                      // Local request: simply return the doc to the asking function
                      } else {
                        self.prepareBeforeSend( request, docAfter, function( err ){
                          if( err ) return self._sendError( request, next, err );


                          self.afterPutExisting( request, doc, fullDoc, docAfter, fullDocAfter, true, function( err ) {
                            if( err ) return self._sendError( request, next, err );

                            next( null, docAfter ); 
                          });
                        });
                      }
                    });                    
                  });
                });
              });
            });
          });
        });
      });
    });
  },

  afterPutExisting: function afterPutExisting( request, doc, fullDoc, docAfter, fullDocAfter, overwrite, done){
    var self = this;

    this.inheritedAsync( afterPutExisting, arguments, function( err ){
      if( err ) return done( err );

      // TODO: run a _broadcast on the *parent* store, 
      //self._broadcast( request, 'storeRecordUpdate', docAfter[ self.idProperty], docAfter, done );

      //stores.workspacesContacts.broadcastStoreChanges( request, 'storeRecordUpdate', contact.id, contact, { tabId: null, cb );

      done( null );
      
    });
  },    

  constructor: function(){
    // * TODO: Check that paramIds match?
  }

});

exports = module.exports = Store;
Store.artificialDelay = 0;
Store.registry = {};

