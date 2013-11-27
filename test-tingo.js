var
  dummy

, declare = require('simpledeclare')

, J = require('jsonreststores')
, SimpleDbLayer = require('simpledblayer')
, Db = require('tingodb')().Db
, TingoMixin = require('simpledblayer-tingo')
;


var allTests = require( "./test-all.js" );

// This function needs to return the DB layer connected to the mongo 

var tests = allTests.get(

  function getDbAndDbDriverAndJRS( done ) {

   try {
     require('fs').mkdirSync('/tmp/tests');
   } catch( e ){
   }

    var db = new Db('/tmp/tests', {});

    var DbDriver = declare( [ SimpleDbLayer, TingoMixin ], { db: db } );
    var JRS = declare( J, { DbDriver: DbDriver } );
    done( null, db, DbDriver, JRS );
  },

  function closeDb( db, done ) {
    db.close( done );
  }
);

for(var test in tests) {
    exports[ test ] = tests[ test ];
}



