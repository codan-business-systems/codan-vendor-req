sap.ui.define([
	"sap/m/UploadCollection",
	"sap/m/UploadCollectionRenderer",
	"sap/m/Button"
], function(UC, UCR, Button) {
	"use strict";
	
	return UC.extend("req.vendor.codan.control.UploadCollection", {
		
		metadata: {
			properties: {
				suppressUpload: {
					type: "boolean",
					default: false
				}
			},
			events: {
				"fakeUploadPress": {}
			}						
		},
		
		renderer: {},
		
		onAfterRendering: function() {
			UC.prototype.onAfterRendering.apply(this, arguments);
			
			// Retrieve a reference to the upload button
			this.uploadButton = this._getFileUploader().oBrowse;
			
			if (this.fakeUploadButton) {
				return;
			}
			
			this.fakeUploadButton = new Button({
				icon: "sap-icon://add",
				type: "Transparent"
			});
			
			this._oHeaderToolbar.addContent(this.fakeUploadButton);
			this.uploadButton.setVisible(!this.getSuppressUpload());
			this.fakeUploadButton.setVisible(this.getSuppressUpload());
			
			this.fakeUploadButton._ucId = this.getId();
			
			this.fakeUploadButton.attachPress(function(event) {
				sap.ui.getCore().byId(this._ucId).fireEvent("fakeUploadPress", {});	
			});
			
		},
		
		setSuppressUpload: function(bValue) {
			this.setProperty("suppressUpload", bValue);
			if (this.uploadButton) {
				this.uploadButton.setVisible(!bValue);
				this.fakeUploadButton.setVisible(bValue);
			}
		}
		
		
	});
});