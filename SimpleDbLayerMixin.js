var 
  dummy
, e = require('allhttperrors')
, declare = require('simpledeclare')
, Schema = require('simpleschema')
, url = require('url')
, async = require('async')
, querystring = require('querystring')
;

/*
KEEP IN MIND:
- If two stores have the same collectionName, the second one will reuse the existing one.
- This means that you can create the stores beforehand, and then get JsonRestStores to use them (nice!)
- In case of reusing, schema, nested, idProperty and hardLimitOnQueries will be ignored (the dbLayer's are used)
- SimpleDbLayerMixin must be passed schema, nested, hardLimitOnQueries, idproperty to create the layer with

ALSO:
- If collectionName is not passed, it's assumed to be the same as storeName
*/

exports = module.exports = declare( null,  {

  // Must be defined for this module to be functional
  DbLayer: null,
  
  // The object representing the table in the DB layer
  dbLayer: null,

  nested: [],
  hardLimitOnQueries: 50,

  collectionName: null,

  constructor: function(){

    var self = this;

    // The db driver must be defined
    if( self.DbLayer == null ){
      throw( new Error("You must define a db driver in constructor class (creating " + self.storeName + ')' ));
    }

    // If collectionName is not specified, it will deduct it from storeName
    self.collectionName = this.collectionName ? this.collectionName : this.storeName;

    // The db layer already has a table called 'collectionName' in the registry!
    // This store will reuse it. In this case, the class' self.schema, self.nested and
    // self.hardLimitOnQueries will be ignored and the dbLayer's will be used instead
    var existingDbLayer = self.DbLayer.getLayer( self.DbLayer, self.collectionName );
    if( existingDbLayer ){
      
      // idProperty must match
      if( self.idProperty != existingDbLayer.idProperty ){
        throw( new Error("When reusing a db layer, idProperties must match.", self.storeName, 'is reusing', existingDbLayer.table ) );
      }

      self.schema = existingDbLayer.schema;
      self.nested = existingDbLayer.nested;
      self.hardLimitOnQueries = existingDbLayer.hardLimitOnQueries;

      self.dbLayer = existingDbLayer;

      // Augment schema making paramIds and onlineSearchSchema searchable
      self._augmentSchema( existingDbLayer.schema );
      
      // Regalculate _searchableHash and _indexGroups as the schema
      // might have changed a little in terms of what's searchable
      existingDbLayer._makeSearchableHashAndIndexGroups();
      
    } else {

      // Augment schema making paramIds and onlineSearchSchema searchable
      self._augmentSchema();

      var layerOptions = {
        schema: self.schema,
        nested: self.nested,
        hardLimitOnQueries: self.hardLimitOnQueries,

        idProperty: self.idProperty,

        schemaError: self.UnprocessableEntityError,
        children: true,
      };
      if( self.position ){
        layerOptions.positionField = '__position';
        layerOptions.positionBase = self.paramIds.slice( 0, -1 ); // TODO: Check, it was 1,-1, why?!?      
      }

      // Actually create the layer with the given parameters
      self.dbLayer = new self.DbLayer( self.collectionName, layerOptions );
    }
     
    // TODO: Check that each entry in self.sortableFields is actually marked as "searchable" in
    // self.schema; otherwise, stop with an error. This is important as any sortable field MUST
    // be searchable
  },

  // Augment schema making paramIds and onlineSearchSchema searchable
  _augmentSchema: function( schema ){
    var self = this;

    if( ! schema ) schema = self.schema;

    // By default, added paramIds will be set as `searchable` in DB `schema`
    for( var i = 0, l = self.paramIds.length; i < l; i ++ ){
      var k = self.paramIds[ i ];
      schema.structure[ k ].searchable = true;
    }

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
          if( schema.structure[ k ] ) schema.structure[ k ].searchable = true;
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

  /*
      * FIRST:
      *   REMOTE: options.filters, options.sort, options.ranges are created by _initOptionsFromReq
      *   LOCAL: user sets options.filters, options.sort, options.ranges, options.skipHardLimitOnQueries

      * AND THEN:
      *   self._queryMakeSelector( filters, sort, ranges ) is called, and returns the full db selector for those options
  */

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

  implementReposition: function( doc, where, beforeId, cb ){
    if( typeof( cb ) === 'undefined' ) cb = function(){};

    // No position field: nothing to do
    if( ! this.dbLayer.positionField ){
       return cb( null );
    }
  
    // Doesn't do much: just tell the layer to repositon  
    this.dbLayer.reposition( doc, where, beforeId, cb );

  },

  implementFetchOne: function( request, cb ){

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
            message: "implementFetchOne fetched more than 1 record",
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

  implementInsert: function( request, forceId, cb ){
   
    var self = this;

    var record = {};

    // Make up the `record` variable, based on the passed `body`
    for( var k in request.body ) record[ k ] = request.body[ k ];
    delete record._children;

    // If generatedId was passed, force the record to
    // that id
    if( forceId ) record[ self.idProperty ] = forceId;

    self.dbLayer.insert( record, { returnRecord: true, skipValidation: true, children: true }, cb );
  },

  implementUpdate: function( request, deleteUnsetFields, cb ){

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
    // If piggyField is there, this is a single-field update
    //var deleteUnsetFields = ! self.piggyField;

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


  implementDelete: function( request, cb ){

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
      //var searchable = self.onlineSearchSchema.structure[ filterField ] && self.onlineSearchSchema.structure[ filterField ].searchable;
      var searchable = self.onlineSearchSchema.structure[ filterField ];
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
            value = element.value || filters[ filterField ];

            conditions[ condition ].push( { field: field, type: type, value: value } );
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

  implementQuery: function( request, next ){

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

    // Add the default sort if no sorting options were passed
    // NOTE: Moved to JsonRestStores
    //if(Object.getOwnPropertyNames( request.options.sort ).length === 0 && self.defaultSort){
    //  request.options.sort = self.defaultSort;
    //}

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



});