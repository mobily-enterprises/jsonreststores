var 
  dummy
, declare = require('simpledeclare')
;

/*
  TODO:
  OK, this one was written in a hurry, and it shows. It *works*, but it's not very pretty nor powerful.
  Things to do:

  * Decide what to do with values that came defined, but as empty strings. If a date is '', what shoud it become?

  Using `declare()` here means that you can _very_ easily define your schema for your own applications,
  and that each Store engine can define the appropriate Schema (for example to check IDs, cast them, etc.)
*/

var SimpleSchema = declare( null, {

  constructor: function( structure, options){
    this.structure = structure;
    this.options = typeof( options ) !== 'undefined' ? options : {};
    console.log("*********SimpleSchema constructor called!");
  },


  idTypeCast: function( definition, value ){ return value; },

  stringTypeCast: function( definition, value){ return value.toString(); },

  numberTypeCast: function( definition, value){ return Number( value ); },
 
  dateTypeCast: function( definition, value){ return new Date( value ); },

  arrayTypeCast: function( definition, value){ return Array.isArray( value ) ? value : [ value ] },



 
  minTypeParam: function( p ){
    if( p.definition.type === 'number' && p.value < definitionValue ){
      p.errors.push( { field: p.fieldName, message: 'Field is too low: ' + p.fieldName } );
    }
  },

  maxTypeParam: function( p ){
    if( p.definition.type === 'number' && p.value > p.definitionValue ){
      p.errors.push( { field: p.fieldName, message: 'Field is too high: ' + p.fieldName } );
    }
  },

  validateTypeParam: function( p ){
    if( typeof( p.definitionValue ) !== 'function' )
      throw( new Error("Validator function needs to be a function, found: " + typeof( p.definitionValue ) ) );

    var r = p.definitionValue.call( p.object, p.object[ p.fieldName ], p.fieldName, p.schema );
    if( typeof( r ) === 'string' ) p.errors.push( { field: p.fieldName, message: r, mustChange: true } );
  },

  uppercaseTypeParam: function( p ){
    if( typeof( p.value ) !== 'string' ) return;
    return  p.value.toUpperCase();
  },
  lowercaseTypeParam: function( p ){
    if( typeof( p.value ) !== 'string' ) return;
    return  p.value.toLowerCase();
  },

  trimTypeParam: function( p ){
    if( typeof( p.value ) !== 'string' ) return;
    return  p.value.substr( 0, p.definitionValue );
  },

  requiredTypeParam: function( p ){

    if( typeof( p.object[ p.fieldName ]) === 'undefined'){

      // Callers can set exceptions to the rule through `option`. This is crucial
      // to exclude some IDs (for example, POST doesn't have an recordId even though
      // recordId is marked as `required` in the schema
      if( !( Array.isArray( p.options.notRequired )  && p.options.notRequired.indexOf( p.fieldName ) != -1  ) ){

        // The error is definitely there!
        p.errors.push( { field: p.fieldName, message: 'Field required:' + p.fieldName, mustChange: true } );
      }
    }
  },

  notEmptyTypeParam: function( p ){
    if( ! Array.isArray( p.value ) && p.objectBeforeCast[ p.fieldName ] == '' ) {
      p.errors.push( { field: p.fieldName, message: 'Field cannot be empty: ' + p.fieldName, mustChange: true } );
    }
  },

  cast: function( object ){
  
  /*
      schema: {
        longName: { type: 'string', required: true, notEmpty: true, trim: 35 },
        tag     : { type: 'number', notEmpty: true, max: 30 },
        _id     : { type: 'id', required: true },
        _tabId  : { type: 'id', doNotSave: true },
      }
    */
  
    var type;
  
    // Scan passed object
    for( var fieldName in object ){
  
      definition = this.structure[ fieldName ];
  
      if( typeof(definition) === 'undefined' ) return;
  
      // Run the xxxTypeCast function for a specific type
      if( typeof( this[ definition.type + 'TypeCast' ]) === 'function' ){
        object[ fieldName ] = this[ definition.type + 'TypeCast' ](definition, object[ fieldName ]);
      } else {
        throw( new Error("No casting function found, type probably wrong: " + definition.type ) );
      }

    }
   
  },

 
  check: function( object, objectBeforeCast, errors, options ){
  
    var type;
    var options = typeof(options) === 'undefined' ? {} : options;
  
    if( ! Array.isArray( errors ) ) errors = [];

    // Scan passed object, check if there are extra fields that shouldn't
    // be there
    for( var k in object ){
  
      // First of all, if it's not in the schema, it's not allowed
      if( typeof( this.structure[ k ] ) === 'undefined' ){
        errors.push( { field: k, message: 'Field not allowed: ' + k, mustChange: false } );
      }
    }

    // Scan schema
    for( var fieldName in this.structure ){
      definition = this.structure[ fieldName ];

       // Run specific functions based on the passed options
      for( var attribute in definition ){
        if( attribute != 'type' ){
          if( typeof( this[ attribute + 'TypeParam' ]) === 'function' ){
            var result = this[ attribute + 'TypeParam' ]({
              value: object[ fieldName ],
              object: object,
              objectBeforeCast: objectBeforeCast,
              fieldName: fieldName,
              definition: definition,
              definitionValue: definition[ attribute ],
              schema: this,
              errors: errors,
              options: options
            } );
            if( typeof( result ) !== 'undefined' ) object[ fieldName ] = result;

          }
             
        }
      }   
 
 
    }
  
  
  },

  cleanup: function( object, attributeName ){
    newObject = {};
    for( var k in object ){
       if( this.structure[ k ][attributeName] ) {
         delete object [ k ]; 
         newObject[ k ] = object[ k ];
       }
    }
    return newObject;
  },


  validate: function( object, error, cb ){

    if( typeof( this.options ) === 'object'  && typeof( this.options.validate) === 'function' ){
      this.options.validate.call( object, this, error, cb );
    } else {
      cb( null, true );
    }
  },

});



exports = module.exports = SimpleSchema;


