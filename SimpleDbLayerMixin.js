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


/*
WHERE AM I?

Make tests pass.
Have a look at the code in general, and so whatever it takes to make tests pass. Tests will ABSOLUTELY
NEED to add a searchOpt test with searchOpt being an array, and check for ranges
*/

exports = module.exports = declare( Object,  {

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
    var existingDbLayer = self.DbLayer.getLayer( self.collectionName );
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
        strictSchemaOnFetch: self.strictSchemaOnFetch,

        idProperty: self.idProperty,

        schemaError: self.UnprocessableEntityError,
        children: true,
      };
      if( self.position ){
        layerOptions.positionField = '__position';
        layerOptions.positionBase = self.paramIds.slice( 0, -1 ); // TODO: Check, it was 1,-1, why?!?      
      }

      layerOptions.table = self.collectionName;
      // Actually create the layer with the given parameters
      self.dbLayer = new self.DbLayer( layerOptions );
    }
     
    // TODO: Check that each entry in self.sortableFields is actually marked as "searchable" in
    // self.schema; otherwise, stop with an error. This is important as any sortable field MUST
    // be searchable

  },

  // Augment schema making paramIds and onlineSearchSchema searchable
  _augmentSchema: function( schema ){
    var self = this;

    if( ! schema ) schema = self.schema;

    // TODO: I think this is now useless as SimpleDbLayer does it
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

      // TODO: check if we need to add more indexes. I think they are all done by simpleDbLayer. Old comment:
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
      *   REMOTE: options.conditions, options.sort, options.ranges are created by _initOptionsFromReq
      *   LOCAL: user sets options.conditions, options.sort, options.ranges, options.skipHardLimitOnQueries

      * AND THEN:
      *   self._queryMakeDbLayerFilter( conditions, sort, ranges ) is called, and returns the full db selector for those options
  */

  _enrichConditionsWithParams: function( conditions, params ){
    
    var self = this;

    // This will have the list of items that will actually get filtered
    // (they are in self.paramIds and are also defined in `params`
    var list = [];
    var returnedConditions = conditions;
    var whereToPush;

    // Get the list of items that _actually_ need to be added
    self.paramIds.forEach( function( paramId ){
      if( params.hasOwnProperty( paramId ) ) list.push( paramId );
    });

    // If nothing needs to be added, leave filter as it is
    if( ! list.length ) return returnedConditions;  

    if( conditions.name === 'and' ){
      whereToPush = conditions.args;
    } else {

      // Turn first condition into an 'and' condition
      returnedConditions = { name: 'and', args: [] };
      whereToPush = returnedConditions.args;
      if( conditions.name ) whereToPush.push( conditions );
    }

    // Add a condition for each paramId, so that it will get satisfied
    list.forEach( function( paramId ){
      whereToPush.push( { name: 'eq', args: [ paramId, params[ paramId ] ] } );
    });

    // If there is only one "and" condition, normalise it to the condition itself
    if( returnedConditions.name === 'and' && returnedConditions.args.length === 1 ){

      returnedConditions = returnedConditions.args[ 0 ];
    }

    return returnedConditions;
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

    // Make up the condition, based on the store's IDs
    var conditions = {};

    // Make up the selector.
    // Remote requests need to have the full filter based on request.params. Local ones
    // only have to have (and I mean HAVE TO) the idProperty
    if( request.remote ){
       conditions = self._enrichConditionsWithParams( conditions, request.params );
    } else {
      conditions = { name: 'eq', args: [ self.idProperty, request.params[ self.idProperty ]  ] };
    }

    //console.log("Conditions:", require('util').inspect( conditions, { depth: 10 } ) ) ;
    //console.log("HERE: ", self.dbLayer );

    //console.log("Conditions: ", { conditions: conditions } );

    // Make the database call 
    self.dbLayer.select( { conditions: conditions }, { children: true }, function( err, docs ){
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
              filter: { conditions: conditions },
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

    // Make up the condition, based on the store's IDs
    var conditions = {};

    // Make up the selector.
    // Remote requests need to have the full conditions based on request.params. Local ones
    // only have to have (and I mean HAVE TO) the idProperty
    if( request.remote ){
       conditions = self._enrichConditionsWithParams( conditions, request.params );
    } else {
      conditions = { name: 'eq', args: [ self.idProperty, request.params[ self.idProperty ]  ] };
    }

    // Make up the `updateObject` variable, based on the passed `body`
    for( var i in request.body ) updateObject[ i ] = request.body[ i ];
    delete updateObject._children;

    // Only delete unset fields if there is no piggyField.
    // If piggyField is there, this is a single-field update
    // var deleteUnsetFields = ! self.piggyField;

    self.dbLayer.update( conditions, updateObject, { deleteUnsetFields: deleteUnsetFields, multi: false, skipValidation: true }, function( err, howMany ){
      if( err ){
        cb( err );
      } else {

        self.dbLayer.select( { conditions: conditions }, { children: true }, function( err, docs ){
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
                  conditions: conditions,
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
    var conditions = {};

    // Make up the selector.
    // Remote requests need to have the full conditions based on request.params. Local ones
    // only have to have (and I mean HAVE TO) the idProperty
    if( request.remote ){
       conditions = self._enrichConditionsWithParams( conditions, request.params );
    } else {
      conditions = { name: 'eq', args: [ self.idProperty, request.params[ self.idProperty ]  ] };
    }

    self.dbLayer.delete( conditions, { multi: false, skipValidation: true }, cb );
  },

  _queryMakeDbLayerFilter: function( remote, conditionsHash, sort, ranges, cb ){
 
    // The simleDbLayer filter that will get returned
    var filter = {};

    var self = this;
    var errors = [];
    var field, name, condition, value;

    // Straight fields that do not need any conversions as they are the same
    // between JsonRestStores and SimpleDbLayer
    filter.ranges = ranges;
    filter.sort = sort;

    // Starting point, with an `and`. This will get trimmed to a straight condition if
    // filter.conditions.args.length is 1
    filter.conditions = { name: 'and', args: [ { name: 'or', args: [ ] } ] };

      //console.log("0", conditionsHash );


    // Add filters to the selector
    for( var searchField in conditionsHash ){

      // There is a slim chance that self.onlineSearchSchema.structure[ searchField ] is not there:
      // it happens in case the request is from API and it required a field available
      // in the main schema but NOT in the search schema
      //var searchable = self.onlineSearchSchema.structure[ searchField ] && self.onlineSearchSchema.structure[ searchField ].searchable;
      var searchable = self.onlineSearchSchema.structure[ searchField ];
      var searchOptions = self.onlineSearchSchema.structure[ searchField ] && self.onlineSearchSchema.structure[ searchField ].searchOptions;

      //console.log("A");
      if( searchable || !remote ) {


      //console.log("B");

        // searchOptions is not an object/is null: just set default conditions (equality with field)
        if( typeof( searchOptions ) !== 'object' || searchOptions === null ){
          //console.log("B1");
          filter.conditions.args.push( { name: 'eq', args: [ searchField, conditionsHash[ searchField ] ] } );

        // searchOptions IS an object: it might be an array or a single condition set
        } else {

      //console.log("C");

         
          // Make sure elements ends up as an array regardless
          if( Array.isArray( searchOptions ) ){
            var elements = searchOptions;
          } else {
            var elements = [ searchOptions ];
          }

          elements.forEach( function( element ){

            //console.log("D", element );
            field = element.field || searchField;
            condition = element.condition || 'and';
            value = element.value || conditionsHash[ searchField ];
            name = element.type;

            //console.log("condition, field, name, value:", condition, field, name, value );

            if( condition === 'and' ){
              filter.conditions.args.push( { name: name, args: [ field, value ] } );
            } else {
              filter.conditions.args[ 0 ].args.push( { name: name, args: [ field, value ] } );              
            }
          });
        }

      // Field is not searchable: error!
      } else {
        errors.push( { field: searchField, message: 'Field not allowed in search: ' + searchField + ' in ' + self.storeName } );
      }      
    }

    //console.log("FILTERS BEFORE TRIMMING: ", require('util').inspect( filter, {  depth: 10 } ) );

    // Call the callback with an error, or with the selector (containing conditions, ranges, sort)
    if( errors.length ) return cb( new self.UnprocessableEntityError( { errors: errors } ) ); 

    var l = filter.conditions.args[ 0 ].args.length;

    // No 'or' conditions: take the whole or condition (the first one) out  
    if( l === 0 ) filter.conditions.args.shift();

    // Only one 'or' condition: place it as a normal 'and' one
    if( l === 1 ) filter.conditions.args[ 0 ] = filter.conditions.args[ 0 ].args[ 0 ];

    var l = filter.conditions.args.length;

    // And is empty: no conditions to speak of
    if( l === 0 ) filter.conditions = {};

    // Only one 'and' condition: shrink it to the condition itself
    if( l === 1 ) filter.conditions = filter.conditions.args[ 0 ]

    //console.log("FILTER: ", filter );

    cb( null, filter );

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


    self._queryMakeDbLayerFilter( request.remote, request.options.conditions, request.options.sort, request.options.ranges, function( err, filter ){
      if( err ){
        next( err );
      } else {

        //console.log("FILTER:", filter );

        if( request.remote) filter.conditions = self._enrichConditionsWithParams( filter.conditions, request.params );

        // Run the select based on the passed parameters
        self.dbLayer.select( filter, dbLayerOptions, next );
      }
    });

  },



});