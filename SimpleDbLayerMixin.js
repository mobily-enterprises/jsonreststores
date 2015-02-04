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

/* I AM HERE:
  * Make up the query based on queryConditions, adding the conditional ifDefined
  * Change Hotplate and BookingDojo to use the new query style
  * Make sure everything works as expected
*/

exports = module.exports = declare( Object,  {

  // Must be defined for this module to be functional
  DbLayer: null,
  
  // The object representing the table in the DB layer
  dbLayer: null,

  nested: [],
  hardLimitOnQueries: 50,

  collectionName: null,

  _foreignSearchFields: [],

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
  
    } else {
      
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
        layerOptions.positionBase = self.paramIds.slice( 0, -1 );      
      }

      layerOptions.table = self.collectionName;
      // Actually create the layer with the given parameters
      self.dbLayer = new self.DbLayer( layerOptions );
    }

    var schema = self.schema;
 
    // By default, added paramIds will be set as `searchable` in DB `schema`
    for( var i = 0, l = self.paramIds.length; i < l; i ++ ){
      self.dbLayer._makeFieldSearchable( self.paramIds[ i ] );
    }

    // Make all LOCAL fields in a search side of any query condition "searchable"
    // Remember: the _remote_ fields will be made searchable in path.field format by
    // layer._makeTablesHashes()
    function visitQueryConditions( o ){
      //console.log("Visiting: ", require('util').inspect( o, { depth: 10 } ) );
      if( o.name === 'and' || o.name === 'or'){
        //console.log("WILL ENTER: ", require('util').inspect( o.args ));
        o.args.forEach( function( condition ){
          //console.log("Entering:", condition );
          visitQueryConditions( condition );
        });
      } else {

        var field = o.args[ 0 ]; 
        // It's a local field: mark it as searchable 
        if( field.indexOf( '.' ) === -1 ){

          // It's a local field: it MUST be in the schema
          if( typeof( self.onlineSearchSchema.structure[ field ] ) === 'undefined' )
            throw new Error("Field " + field + " cannot be in query if it's not in the schema")

          if( !self.onlineSearchSchema.structure[ field ].searchOptions ){ // TODO: DELETE ME LATER 
            self.dbLayer._makeFieldSearchable( field );
          }
        }
      }
    }
    visitQueryConditions( self.queryConditions );

/*
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
          if( schema.structure[ k ] ){
            self.dbLayer._makeFieldSearchable( k );
          }
        } 

      // More complex case: `searchOptions` is there. This means that
      // the referenced field *might* be different.
      // Things are made tricky by the fact that searchOptions can be
      // an object, or an array of objects.
      // Array or not, objects can define a `field` key specifying which field
      // should be used for the search.
      } else {
     
        if( Array.isArray( entry.searchOptions ) ){
          var elements = entry.searchOptions;
        } else {
          var elements = [ entry.searchOptions ];
        }

        elements.forEach( function( element ){
          var fieldName = element.field ? element.field : k;

          if( self.schema.structure[ fieldName ]) {
            self.dbLayer._makeFieldSearchable( fieldName );
          }

        });

      }
      
    }
  */  

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

  /*
  MERC: Go through searchOptions recursively to create the query

  workoutArgs( schema, condition );

* Field name is always first argument of eq, startsWith, endsWith, contains, lt, lte, gt, gte
* When a value is expected (second argument of all operators), it's compared directly, except if it's '#something#', in which case it's the 'something' key in onlineSearchSchema (condition added only if entry in onlineSearchSchema defined).
* The query is "shrunk" at the end: all 'and' and 'or' entries with only one entry are converted in the entry itself



  */
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
    filter.conditions = {};

    function getQueryFromQueryConditions( ){

      // Make up filter.conditions
      function visitQueryConditions( o, fc ){

        // Check o.ifDefined. If the corresponding element in onlineSearchSchema is not
        // defined, won't go there
        if( o.ifDefined ){
          if( ! conditionsHash[ o.ifDefined ] ){ return false; }
        }

        if( o.name === 'and' || o.name === 'or'){
          fc.name = o.name;
          fc.args = [];

          o.args.forEach( function( condition ){

            // If it's 'and' or 'or', check the length of what gets returned
            if( condition.name === 'and' || condition.name === 'or' ){

              // Make up the new condition, visit that one
              var newCondition = {};
              var f = visitQueryConditions( condition, newCondition );

              // Falsy return means "don't continue"
              if( f === false ) return;

              // newCondition is empty: do not add anything to fc
              if(  newCondition.args.length === 0 ){
                return;
              // Only one condition returned: get rid of logical operator, add the straight condition
              } else if( newCondition.args.length === 1 ){
                var actualCondition = newCondition.args[ 0 ];
                fc.args.push( { name: actualCondition.name, args: actualCondition.args } );
              // Multiple conditions returned: the logical operator makes sense
              } else {
                fc.args.push( newCondition );
              }

            // If it's a leaf  
            } else {
              var newCondition = {};
              var f = visitQueryConditions( condition, newCondition );
              if( f !== false ) fc.args.push( newCondition );
            } 
          });

        // It's a terminal point
        } else {
          var arg0 = o.args[ 0 ];
          var arg1 = o.args[ 1 ];

          // No arg1: most likely a unary operator, let it live.
          if( typeof( arg1 ) === 'undefined'){
            fc.name = o.name;
            fc.args = [];
            fc.args[ 0 ] = arg0;
          }

          // The second argument has a "but!". 
          // If it is in form #something#, it means that it's
          // actually a field in onlineSearchSchema
          var m = ( arg1.match && arg1.match( /^#(.*?)#$/) );
          if( m ) {
            var osf = m[ 1 ];

            // If it's in form #something#, then entry MUST be in onlineSearchSchema
            if( ! self.onlineSearchSchema.structure[ osf ] ) throw new Error("Searched for " + arg1 + ", but didn't find corresponding entry in onlineSearchSchema");

            if( conditionsHash[ osf ] ){
              fc.name = o.name;
              fc.args = [];
              fc.args[ 0 ] = arg0;
              fc.args[ 1 ] = conditionsHash[ osf ];
            } else {
              // For leaves, this will tell the callee NOT to add this.
              return false;
            };

          // The second argument is not in form #something#: it means it's a STRAIGHT value
          } else {
            fc.name = o.name;
            fc.args = [];
            fc.args[ 0 ] = arg0;
            fc.args[ 1 ] = arg1;
          }
        }
      }

      // This will be returned
      var res = {};
      visitQueryConditions( self.queryConditions, res );

      // visitQueryConditions does a great job avoiding duplication, but
      // top-level duplication needs to be checked here
      if( ( res.name === 'and' || res.name === 'or' ) && res.args.length === 1 ){
        return res.args[ 0 ];
      } 

      return res;
    }



    console.log("ORIG: ", require('util').inspect( self.queryConditions, { depth: 10 } ));
    console.log("COPY: ", require('util').inspect( getQueryFromQueryConditions(), { depth: 10 } ));

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

        // searchOptions is not an object/is null: just set default conditions (equality with field)
        if( typeof( searchOptions ) !== 'object' || searchOptions === null ){
          //console.log("B1");
          filter.conditions.args.push( { name: 'eq', args: [ searchField, conditionsHash[ searchField ] ] } );

        // searchOptions IS an object: it might be an array or a single condition set
        } else {
         
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


        /*
        // CHUNK #1
        // Work out layer and fields
        // Somebody please come up with a much more elegant way of doing this
        var layer, field;
        //console.log("First argument:", o.args[ 0 ] );
        // The DB field is always the first parameter
        var dbFieldEntries = o.args[ 0 ].split( '.' );
        if( dbFieldEntries.length === 1 ){
          field = dbFieldEntries[ 0 ];
        } else {
          layer = dbFieldEntries[ 0 ];
          field = dbFieldEntries[ 1 ];
        }

        // This is for a local field: make it searchable
        if( ! layer ){
          }
        } else {


        }
        */
