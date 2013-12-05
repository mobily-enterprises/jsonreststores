    var declare = require('simpledeclare'); // Declare module

    var dbSpecific = require('./dbSpecific-tingo.js');

    exports = module.exports = function( app ){

      var JRS = dbSpecific.JRS;
      var Schema = dbSpecific.Schema;
    
      var People = declare( JRS, {
    
        schema: new Schema({
          id     : { type: 'id', required: true },
          name   : { type: 'string', trim: 60 },
          surname: { type: 'string', trim: 60 },
        }),
    
        paramIds: [ 'id' ],
        storeName: 'People',
    
        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,
    
        hardLimitOnQueries: 50,
      });
    
      People.onlineAll( app, '/people/', ':id' );

      var Managers = declare( JRS, {
    
        schema: new Schema({
          id     : { type: 'id', required: true },
          name   : { type: 'string', trim: 60 },
          surname: { type: 'string', trim: 60 },
        }),
    
        paramIds: [ 'id' ],
        storeName: 'Managers',
    
        handlePut: true,
        handlePost: true,
        handleGet: true,
        handleGetQuery: true,
        handleDelete: true,
    
        hardLimitOnQueries: 50,
      });
    
      Managers.onlineAll( app, '/managers/', ':id' );
 

    }
