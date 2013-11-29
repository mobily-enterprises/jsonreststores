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

  function getDbAndDbDriverAndJRS( done ) {

    mw.connect('mongodb://localhost/tests', {}, function( err, db ){
      if( err ){
        throw new Error("MongoDB connect: could not connect to database");
      } else {
        var DbDriver = declare( [ SimpleDbLayer, MongoMixin ], { db: db } );
        var JRS = declare( J, { DbDriver: DbDriver } );
        done( null, db, DbDriver, JRS );
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



