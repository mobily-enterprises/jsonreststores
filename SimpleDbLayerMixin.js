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
- If collectionName is not passed, it's assumed to be the same as storeName
- If two stores have the same collectionName, the second one will reuse the existing one.
- This means that you can create the stores beforehand, and then get JsonRestStores to use them (nice!)
- In case of reusing, schema, nested, idProperty and hardLimitOnQueries will be ignored (the dbLayer's are used)
- SimpleDbLayerMixin must be passed schema, nested, hardLimitOnQueries, idproperty to create the layer with
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
      self.strictSchemaOnFetch = existingDbLayer.strictSchemaOnFetch;

      self.dbLayer = existingDbLayer;
  
    } else {
      
      var layerOptions = {
        idProperty: self.idProperty,
        schema: self.schema,
        nested: self.nested,
        hardLimitOnQueries: self.hardLimitOnQueries,
        strictSchemaOnFetch: self.strictSchemaOnFetch,        

        schemaError: self.UnprocessableEntityError,
        fetchChildrenByDefault: true,
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

      if( ! o.name ) throw new Error("Filter's 'name' attribute missing");
      if( ! Array.isArray( o.args) ) throw new Error("Filter's 'args' attribute must be an array");

      //console.log("Visiting: ", require('util').inspect( o, { depth: 10 } ) );
      if( o.name === 'and' || o.name === 'or'){
        //console.log("WILL ENTER: ", require('util').inspect( o.args ));
        o.args.forEach( function( condition ){
          //console.log("Entering:", condition );
          visitQueryConditions( condition );
        });
      } else {

        //console.log( require('util').inspect( o, { depth: 10 } ) );
        var field = o.args[ 0 ]; 
        // It's a local field: mark it as searchable 
        if( field.indexOf( '.' ) === -1 ){

          // It's a local field: it MUST be in the schema
          if( typeof( self.schema.structure[ field ] ) === 'undefined' )
            throw new Error("Field " + field + " cannot be in query if it's not in the schema")

          self.dbLayer._makeFieldSearchable( field );
        }
      }
    }
    visitQueryConditions( self.queryConditions );
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

    // Make the database call 
    self.dbLayer.select( { conditions: conditions, ranges: { limit: 1 } }, { children: true }, function( err, docs ){
      if( err ) return cb( err );

      if( docs.length === 0 ) return cb( null, null );
      cb( null, docs[ 0 ] );
    });

  }, 

  implementInsert: function( request, forceId, cb ){
   
    var self = this;

    var record = self._co( request.body );

    // _children are not inserted
    delete record._children;

    // If generatedId was passed, force the record to
    // that id
    if( forceId ) record[ self.idProperty ] = forceId;

    self.dbLayer.insert( record, { skipValidation: true, children: true }, cb );
  },

  implementUpdate: function( request, deleteUnsetFields, cb ){

    var self = this;
    var updateObject;

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
    updateObject = self._co( request.body );
    delete updateObject._children;

    self.dbLayer.update( conditions, updateObject, { deleteUnsetFields: deleteUnsetFields, multi: false, skipValidation: true }, function( err, howMany, record ){
      if( err ) return cb( err );
      cb( null, record );
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
      if( ( res.name === 'and' || res.name === 'or' )){
        if( res.args.length === 0 ) return {};
        if( res.args.length === 1 ) return res.args[ 0 ];
        return res;
      }
    }

    filter.conditions = getQueryFromQueryConditions();

    //console.log( self.collectionName );
    //console.log("QUERYCONDITIONS", require('util').inspect( self.queryConditions, { depth: 10 } ));
    //console.log("CONDITIONS HASH:", require('util').inspect( conditionsHash, { depth: 10 } ));
    //console.log("ORIG: ", require('util').inspect( self.queryConditions, { depth: 10 } ));
    //console.log("COPY: ", require('util').inspect( getQueryFromQueryConditions(), { depth: 10 } ));

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
