var 
  dummy
, declare = require('./declare')
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


  // id
  idTypeCast: function( definition, value ){
    return value; 
  },
  idTypeCheck: function( definition, name, value, errors ){
  },

  // string
  stringTypeCast: function( definition, value){
    value = value.toString();

    // Trim it if necessary. Since there is no chanche of adding an error,
    // I consider this part of casting
    if( definition.trim ) value = value.substr( 0, definition.trim );
    if( definition.lowercase) value = value.toLowerCase();
    if( definition.uppercase) value = value.toLowerCase();

    return value;
  },
  stringTypeCheck: function( definition, name, value, errors ){
  },

  numberTypeCast: function( definition, value){
    return Number( value );
  },
  numberTypeCheck: function( definition, name, value, errors ){
    // Check its range
    if( typeof( definition.max ) !== 'undefined'  && value > definition.max )
      errors.push( { field: name, message: 'Field is too high: ' + name } );
    if( typeof( definition.min ) !== 'undefined'  && value < definition.min )
      errors.push( { field: name, message: 'Field is too low: ' + name } );
  },

  
  dateTypeCast: function( definition, value){
   return new Date( value );
    
  },
  dateTypeCheck: function( definition, name, value, errors ){
  },


  arrayTypeCast: function( definition, value){
    if( ! Array.isArray( value ) ){
      // Turn into an Array with 1 value: the original object
      return [ value ];
    }
    return value;
  },
  arrayTypeCheck: function( definition, name, value, errors ){
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
    for( var k in object ){
  
  
      definition = this.structure[ k ];
  
      if( typeof(definition) === 'undefined' ) return;
  
      // Run the xxxTypeCast function for a specific type
      if( typeof( this[ definition.type + 'TypeCast' ]) === 'function' ){
        object[ k ] = this[ definition.type + 'TypeCast' ](definition, object[ k ]);
      } else {
        throw( new Error("No casting function found, type probably wrong: " + definition.type ) );
      }

        /* 
        switch(definition.type){
  
          case 'string':
            object[ k ] = object[ k ].toString();
            // Trim it if necessary. Since there is no chanche of adding an error,
            // I consider this part of casting
            if( definition.trim ) object[ k ] = object[ k ].substr( 0, definition.trim );
            if( definition.lowercase) object[ k ] = object[ k ].toLowerCase();
            if( definition.uppercase) object[ k ] = object[ k ].toLowerCase();
          break;
     
          case 'number':
            object[ k ] = Number( object[k] );
          break;
  
          case 'date':
            object[ k ] = new Date( object[ k ] );
          break;
  
          case 'id':
            object[ k ] = this.castId( object[ k ] );
          break;
  
          case 'array':
            if( ! Array.isArray( object[ k ] ) ){
               // Turn into an Array with 1 value: the original object
               object[ k ] = [ object[ k ] ];
            }
          break;
  
        }
       */

    }
   
  },
  
  check: function( object, objectBeforeCast, errors, options ){
  
  /*
      schema: {
        longName: { type: 'string', required: true, notEmpty: true, trim: 35 },
        tag     : { type: 'number', notEmpty: true, max: 30 },
        _id     : { type: 'id', required: true },
        _tabId  : { type: 'id', doNotSave: true },
      }
    */
  
    var type;
  
    var options = typeof(options) === 'undefined' ? {} : options;
  
    if( ! Array.isArray( errors ) ) errors = [];
  
    // Use the global validator first
    if( typeof( this.options.validator) !== 'undefined' ){
      this.options.validator.call( this, object, errors );
    }
   
    // Scan schema
    for( var k in this.structure ){
      definition = this.structure[ k ];
     
      // Check that all "required" fields are there
      if( definition.required && typeof( object[ k ]) === 'undefined'){

         // Callers can set exceptions to the rule through `option`. This is crucial
         // to exclude some IDs (for example, POST doesn't have an recordId even though
         // recordId is marked as `required` in the schema
         if( !( Array.isArray( options.notRequired )  && options.notRequired.indexOf( k ) != -1  ) ){

          // The error is definitely there!
          errors.push( { field: k, message: 'Field required:' + k, mustChange: true } );
        }
      }
    }
  
  
    // Scan passed object
    for( var k in object ){
  
      // First of all, if it's not in the schema, it's not allowed
      if( typeof( this.structure[ k ] ) === 'undefined' ){
        errors.push( { field: k, message: 'Field not allowed: ' + k, mustChange: false } );
      } else {
  
        // Get the value type
        definition = this.structure[ k ];
  
        // Check if the value was empty when it was submitted and it shouldn't have been

        if( definition.notEmpty && ! Array.isArray( object[ k ] ) && objectBeforeCast[ k ] == '' ) {
            errors.push( { field: k, message: 'Field cannot be empty: ' + k, mustChange: true } );
        }
  
        // Apply fieldValidators
        if( typeof( definition.fieldValidator) !== 'undefined' ){
          var msg = definition.fieldValidator( false );
          if( ! definition.fieldValidator( object[ k ] ) )
            errors.push( { field: k, message: msg, mustChange: true } );
        }
  
        // Run the xxxTypeCheck function for a specific type
        if( typeof( this[ definition.type + 'TypeCheck' ]) === 'function' ){
          this[ definition.type + 'TypeCheck' ](definition, k, object[ k ], errors );
        } else {
          throw( new Error("No checking function found, type probably wrong: " + definition.type ) );
        }

        /*
        switch(definition.type){
  
          case 'string':
          break;
     
          case 'number':
            // Check its range
            if( typeof( definition.max ) !== 'undefined'  && object[k] > definition.max )
              errors.push( { field: k, message: 'Field is too high: ' + k, mustChange: true } );
            if( typeof( definition.min ) !== 'undefined'  && object[k] < definition.min )
              errors.push( { field: k, message: 'Field is too low: ' + k, mustChange: true } );
          break;
  
          case 'date':
          break;
  
          case 'id':
            if( ! this.checkId( object[ k ] ) )
              errors.push( { field: k, message: 'Invalid ID: ' + k, mustChange: false } );
          break;
  
          case 'array':
          break;
        }
        */
  
      }
   
    }
    
  },

  cleanup: function( object ){
    newObject = {};
    for( var k in object ){
       if( this.structure[ k ].doNotSave ) {
         delete object [ k ]; 
         newObject[ k ] = object[ k ];
       }
    }
    return newObject;
  },

});



exports = module.exports = SimpleSchema;






