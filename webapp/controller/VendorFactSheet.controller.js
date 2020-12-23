jQuery.sap.registerModulePath("factsheet.vendor.codan", "/sap/bc/ui5_ui5/sap/z_ven_req_fact");

sap.ui.define([
	"req/vendor/codan/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"sap/m/MessagePopover",
	"sap/m/MessagePopoverItem",
	"sap/ui/core/MessageType",
	"sap/ui/core/message/Message",
	"sap/m/MessageToast",
	"req/vendor/codan/model/postcodeValidator",
	"sap/ui/core/ValueState",
	"req/vendor/codan/model/formatter"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox, MessagePopover, MessagePopoverItem, MessageType, Message,
	MessageToast, postcodeValidator, ValueState, formatter) {
	"use strict";

	return BaseController.extend("req.vendor.codan.controller.VendorFactSheet", {

		_oFactSheetComponent: undefined,

		/**
		 * Called when the worklist controller is instantiated, sets initial
		 * values and initialises the model
		 * @public
		 */
		onInit: function () {

			// Call the BaseController's onInit method (in particular to initialise the extra JSON models)
			BaseController.prototype.onInit.apply(this, arguments);

			this._oViewModel = new JSONModel({
				busy: false,
				delay: 0,
				submitVisible: true,
				submitAction: "Submit for Approval",
				changeRequestMode: false,
				editMode: false
			});

			this.setModel(this._oViewModel, "detailView");

			this.getRouter().getRoute("vendorFactSheet").attachPatternMatched(this._onObjectMatched, this);
			this.getRouter().getRoute("changeRequest").attachPatternMatched(this._onChangeRequestMatched, this);
			this.getRouter().getRoute("newVendor").attachPatternMatched(this._onNewVendor, this);

		},

		onNavBack: function () {

			var that = this;

			var navBack = function () {
				that.getModel().resetChanges();
				that._navBack();
			};

			if (this._oFactSheetComponent.getProperty("editable") && this.getModel().hasPendingChanges()) {
				MessageBox.confirm("This request will be lost. Do you wish to continue?", {
					title: "Data Loss Confirmation",
					onClose: function (sAction) {
						if (sAction === sap.m.MessageBox.Action.OK) {
							navBack();
						}
					}

				});
				return;
			}
			this._navBack();

		},

		onSave: function () {
			this._oFactSheetComponent.save();
		},

		onSubmit: function () {

			this._oFactSheetComponent.submit();

		},
		
		displayMessagesPopover: function (oEvent) {
			var oMessagesButton = oEvent ? oEvent.getSource() : this.byId("vendorFactSheetPage")
				.getAggregation("messagesIndicator").getAggregation("_control");

			if (!this._oMessagePopover) {
				this._oMessagePopover = new MessagePopover({
					items: {
						path: "message>/",
						template: new MessagePopoverItem({
							description: "{message>description}",
							type: "{message>type}",
							title: "{message>message}",
							subtitle: "{message>subtitle}"
						})
					},
					initiallyExpanded: true
				});
				oMessagesButton.addDependent(this._oMessagePopover);
			}

			if (oEvent || !this._oMessagePopover.isOpen()) {
				this._oMessagePopover.toggle(oMessagesButton);
			}

		},

		/**
		 * Binds the view to the object path.
		 * @function
		 * @param {string} sObjectPath path to the object to be bound
		 * @private
		 */
		_bindView: function (sObjectPath) {
			var oViewModel = this.getModel("detailView"),
				oDataModel = this.getModel();
				
			if (sObjectPath === "/Requests('')") {
				return;
			}

			this.getView().bindElement({
				path: sObjectPath,
				events: {
					change: this._onBindingChange.bind(this),
					dataRequested: function () {
						oDataModel.metadataLoaded().then(function () {
							// Busy indicator on view should only be set if metadata is loaded,
							// otherwise there may be two busy indications next to each other on the
							// screen. This happens because route matched handler already calls '_bindView'
							// while metadata is loaded.
							oViewModel.setProperty("/busy", true);
						});
					},
					dataReceived: function (data) {

						oViewModel.setProperty("/busy", false);
						var result = data.getParameter ? data.getParameter("data") : data;

						oViewModel.setProperty("/existingVendor", !!result.vendorId);
						
						if (oViewModel.getProperty("/changeRequestMode")) {
							if (result.status === "R" || !result.status) {
								oViewModel.setProperty("/submitVisible", true);
								oViewModel.setProperty("/submitAction", result.status === "R" ? "Resubmit" : "Submit");
							}
						}

					}.bind(this)
				}
			});

		},

		_initialiseFactSheetComponent: function (oSettings) {
			var that = this;
			return new Promise(function (res, rej) {

				if (that._oFactSheetComponent) {
					res();
					return;
				}

				sap.ui.component({
					name: "factsheet.vendor.codan",
					settings: oSettings,
					async: true,
					manifestFirst: true //deprecated from 1.49+
						// manifest : true    //SAPUI5 >= 1.49
				}).then(function (oComponent) {
					that._oFactSheetComponent = oComponent;
					that.byId("componentFactSheet").setComponent(that._oFactSheetComponent);
					
					that._oFactSheetComponent.attachEvent("editModeChanged", function(event) {
						that.getModel("detailView").setProperty("/editMode", event.getParameter("editable"));	
					});
					
					that._oFactSheetComponent.attachEvent("messagesRaised", function() {
						that.displayMessagesPopover();
					});
					res();
				}).catch(function (oError) {
					jQuery.sap.log.error(oError);
					rej();
				});
			});
		},

		_onChangeRequestMatched: function (oEvent) {
			var oStartupParams = oEvent.getParameter("arguments");

			if (!oStartupParams || !oStartupParams.id) {
				return;
			}
			
			this.getModel("detailView").setProperty("/submitVisible", false);
			this.getModel("detailView").setProperty("/changeRequestMode", true);
			this.getModel("detailView").setProperty("/editMode", true);

			this._sRequestId = oStartupParams.id;
			this._sCompanyCode = oStartupParams.companyCode;
			
			this._setupFactSheetComponent({
				requestId: this._sRequestId,
				vendorId: "",
				companyCode: this._sCompanyCode,
				editable: true,
				editBankDetails: false,
				changeRequestMode: true,
				showHeader: false
			});

		},

		/**
		 * Create a new request and binds the view
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		_onNewVendor: function (oEvent) {

			this._sCompanyCode = oEvent.getParameter("arguments").companyCode;
			this.getModel("detailView").setProperty("/submitVisible", true);
			this.getModel("detailView").setProperty("/changeRequestMode", false);
			this.getModel("detailView").setProperty("/editMode", true);

			this._setupFactSheetComponent({
				companyCode: this._sCompanyCode,
				editable: true,
				editBankDetails: false,
				changeRequestMode: false,
				vendorId: "",
				requestId: "",
				showHeader: false
			});

		},

		/**
		 * Binds the view to the object path.
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		_onObjectMatched: function (oEvent) {

			this._sVendorId = oEvent.getParameter("arguments").id;
			this._sCompanyCode = oEvent.getParameter("arguments").companyCode;
			
			
			this.getModel("detailView").setProperty("/submitVisible", true);
			this.getModel("detailView").setProperty("/changeRequestMode", false);
			this.getModel("detailView").setProperty("/editMode", false);

			this._setupFactSheetComponent({
				vendorId: this._sVendorId,
				companyCode: this._sCompanyCode,
				existingVendor: !!this._sVendorId,
				editBankDetails: !this._sVendorId,
				changeRequestMode: false,
				editable: false,
				showHeader: true
			});
		},

		_setupFactSheetComponent: function (oSettings) {
			var that = this;
			
			this._initialiseFactSheetComponent(oSettings).then(function () {
				for (var prop in oSettings) {
					if (oSettings.hasOwnProperty(prop)) {
						var setter = "set" + prop.charAt(0).toUpperCase() + prop.slice(1);
						that._oFactSheetComponent[setter](oSettings[prop]);
					}
				}

				that._oFactSheetComponent.loadData().then(function () {
					that._bindView(that._oFactSheetComponent.getObjectPath());
				});
			});
			

		}
	});
});