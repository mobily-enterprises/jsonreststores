var
  dummy

, declare = require('simpledeclare')

, J = require('./JsonRestStores.js')
, SimpleDbLayer = require('simpledblayer')
, MongoMixin = require('simpledblayer-mongo')

, mw = require('mongowrapper')
;


var allTests = require( "./test-all.js" );

// This function needs to return the DB layer connected to the mongo 

var tests = allTests.get(

  function getDbAndDbLayerAndJRS( done ) {

    mw.connect('mongodb://localhost/tests', {}, function( err, db ){
      if( err ){
        throw new Error("MongoDB connect: could not connect to database");
      } else {
        var DbLayer = declare( [ SimpleDbLayer, MongoMixin ], { db: db } );
        var JRS = declare( J, { DbLayer: DbLayer } );
        done( null, db, DbLayer, JRS );
      }
    });
  },

  function closeDb( db, done ) {
    db.close( done );
  }
);

for(var test in tests) {
    exports[ test ] = tests[ test ];
}



