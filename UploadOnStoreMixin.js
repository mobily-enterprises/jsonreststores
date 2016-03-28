/*
Copyright (C) 2016 Tony Mobily

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/


/*
  THIS MIXIN IS UGLY.
  File uploads should be handles better. Either straight from within JsonRestStores (ugh), or in a much nicer
  way than this.
  The main problem is that it expects to be mixed in with HTTPMixin, since it creates a specifically crafted route

  */
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
    return cb( null, file.fieldname + '_' + req.params[ this.idProperty ] );
  },

  // This is to refuse or accept files
  checkUploadedFile: function( req, file, cb ){
    return cb( null, true );
  },

  'permissions-doc': {
    'put': `Testing string. This should be displayed in the derivative one if requested. And this should work too: {{permissions-doc.put}}`
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

          var fullDoc = {};
          fullDoc[ fieldKey ] = req.file.filename;

          // Make up the PUT request
          var request = new Object();
          request.remote = true;
          request.protocol = 'HTTP';
          request.params = self._co( req.params ); // NOTE: this is a copy
          request.body = fullDoc;
          request.session = req.session;
          request.options = { field: fieldKey };
          request.isUpload = true;
          request._req = req;
          request._res = res;

          self._makePut( request, next );
        });
      });
    });
  }
});

exports = module.exports = UploadOnStoreMixin;
