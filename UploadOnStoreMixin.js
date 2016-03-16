
var
  dummy
, e = require('allhttperrors')
, p = require('path')
, declare = require('simpledeclare')
, Schema = require('simpleschema')
, async = require('async')
, SimpleDbLayerMixin = require('./SimpleDbLayerMixin.js')
, HTTPMixin = require('./HTTPMixin.js')
, multer  = require('multer')
;

var UploadOnStoreMixin = declare( Object,  {
  uploadFields: {},

  // This would ideally be redefined
  makeUploadedFileName: function( req, file, cb ){
    console.log( this );
    return cb( null, file.fieldname + '_' + req.params[ this.idProperty ] );
  },

  // This is to refuse or accept files
  checkUploadedFile: function( req, file, cb ){
    return cb( null, true );
  },

  checkPermissions: function f( request, method, cb ){

    var self = this;

    this.inheritedAsync( f, arguments, function( err, res ){
      if( err ) return cb( err );
      if( ! res ) return cb( null, false );

      if( request.isUpload) return cb( null, true );

      var found = false;
      Object.keys( self.uploadFields ).forEach( function( fieldKey ){
        if( request.body[ fieldKey ] ) found = true;
      });
      if( found ) return cb( new e.UnprocessableEntityError("You cannot set path fields directly") );

      // TODO: IMPLEMENT CHECK FOR EVERY FIELD, IT MUSTN'T CHANGE
      cb( null, true );
    })

  },

  // It will oveload protocolListenHTTP
  // in order to ALSO listen to extra routes to upload files
  protocolListenHTTP: function f( params ){

    this.inherited( f, arguments );

    var self = this;

    Object.keys( self.uploadFields ).forEach( function( fieldKey ){

      var field = self.uploadFields[ fieldKey ];

      // Make up the storage object for multer, which will define destination (static)
      // and fileName (worked out from req)
      var storage = multer.diskStorage({
        destination: field.destination,
        filename: field.makeUploadedFileName? field.makeUploadedFileName.bind( self ) : self.makeUploadedFileName.bind( self )
      });

      // Make up the upload object which will be the middleware
      var upload = multer( { storage: storage } );

      // Make up the URL that will be listened to, which will also include
      // the field
      var url = p.join( self.getFullPublicURL(), 'upload', fieldKey );

      params.app.put( url, upload.single( fieldKey ), function (req, res, next ) {

        // If the file is not there, puke
        if( ! req.file || ! req.file.path ) {
          var err = new e.UnprocessableEntityError();
          err.message = "File not uploaded, aborting";
          return next( err );
        }

        self.checkUploadedFile( req, req.file, function( err, granted, message ){
          if( err ) return next( err );

          // If permission wasn't granted, return wit ha badRequestError
          if( ! granted ){
            var err = new e.BadRequestError( { errors: [ { field: fieldKey, message: "File refused: " + message } ] });
            if( err ) return next( err );
          }

          self.dbLayer.selectById( self.schema.vendor.ObjectId( req.params[ self.idProperty ]), function( err, record ){
            if( err ) return self._sendError( request, 'upload', next, err );

            if( !record ) return next( new e.NotFoundError() );

            // Use fullDoc, which is the doc before any manipulation
            // or postprocessing, as it came from the DB
            var fullDoc = record;
            delete fullDoc._children;
            fullDoc[ fieldKey ] = req.file.filename;

            // Make up the PUT request
            var request = new Object();
            request.remote = true;
            request.protocol = 'HTTP';
            request.params = self._co( req.params ); // NOTE: this is a copy
            request.body = self._co( fullDoc ); // NOTE: this is a copy
            request.session = req.session;
            request.options = { }; // Always empty for a get
            request.isUpload = true;
            request._req = req;
            request._res = res;

            self._makePut( request, next );
          });
        });
      });
    });
  }
});

exports = module.exports = UploadOnStoreMixin;
