sap.ui.define([
	"req/vendor/codan/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/core/ValueState"
], function (BaseController, JSONModel, Filter, FilterOperator, ValueState) {
	"use strict";

	return BaseController.extend("req.vendor.codan.controller.SearchVendor", {

		/**
		 * Called when the worklist controller is instantiated, sets initial
		 * values and initialises the model
		 * @public
		 */
		onInit: function () {
			var oViewModel,
				iOriginalBusyDelay,
				oTable = this.byId("searchResultsTable");

			// Put down worklist table's original value for busy indicator delay,
			// so it can be restored later on. Busy handling on the table is
			// taken care of by the table itself.
			iOriginalBusyDelay = oTable.getBusyIndicatorDelay();

			// Model used to manipulate control states
			oViewModel = new JSONModel({
				worklistTableTitle: this.getResourceBundle().getText("worklistTableTitle"),
				saveAsTileTitle: this.getResourceBundle().getText("worklistViewTitle"),
				shareOnJamTitle: this.getResourceBundle().getText("worklistViewTitle"),
				shareSendEmailSubject: this.getResourceBundle().getText("shareSendEmailWorklistSubject"),
				shareSendEmailMessage: this.getResourceBundle().getText("shareSendEmailWorklistMessage", [location.href]),
				tableBusyDelay: 0,
				// search query parameters
				vendorName: "",
				searched: false,
				companyCode: ""
			});

			this.setModel(oViewModel, "worklistView");

			// Show busy immediately while we load the select company dialog
			sap.ui.core.BusyIndicator.show(100);

			var that = this;

			this.oCommonModel = this.getOwnerComponent().getModel("common");
			this.oCommonModel.metadataLoaded().then(function () {
				that.oCommonModel.read("/AppParameters", {
					filters: [new Filter({
						path: "application",
						operator: FilterOperator.EQ,
						value1: "VENDOR_REQ"
					})],
					success: function (data) {
						var found = false;
						data.results.forEach(function (o) {
							switch (o.name) {
							case "COMPANYCODE":
								found = true;
								oViewModel.setProperty("/companyCode", o.value);
								break;
							default:
							}
						});

						if (!found) {
							that.getOwnerComponent().getModel().metadataLoaded().then(function () {
								that._showCompanySelectDialog();
								sap.ui.core.BusyIndicator.hide();
							});
						} else {
							sap.ui.core.BusyIndicator.hide();
						}
					}
				});
			});

			// Make sure, busy indication is showing immediately so there is no
			// break after the busy indication for loading the view's meta data is
			// ended (see promise 'oWhenMetadataIsLoaded' in AppController)
			oTable.attachEventOnce("updateFinished", function () {
				// Restore original busy indicator delay for worklist's table
				oViewModel.setProperty("/tableBusyDelay", iOriginalBusyDelay);
			});
		},

		createNewVendor: function () {
			this.getRouter().navTo("newVendor", {
				companyCode: this.getModel("worklistView").getProperty("/companyCode")	
			});
		},

		/**
		 * Execute the search
		 * @public
		 */
		onSearch: function () {
			var searchString = this.getModel("worklistView").getProperty("/vendorName");

			if (!searchString) {
				return;
			}

			this.byId("searchResultsTable").getBinding("items").filter(new Filter({
				path: "name",
				operator: sap.ui.model.FilterOperator.Contains,
				value1: searchString
			}));

		},

		/**
		 * Navigate to an existing vendor
		 * This may lead to a new request
		 * @public
		 */
		onSelectVendor: function (event) {
			this.getRouter().navTo("vendorFactSheet", {
				id: event.getSource().getBindingContext().getProperty("id"),
				companyCode: this.getModel("worklistView").getProperty("/companyCode")
			});
		},

		/**
		 * Triggered by the table's 'updateFinished' event: after new table
		 * data is available, this handler method updates the table counter.
		 * This should only happen if the update was successful, which is
		 * why this handler is attached to 'updateFinished' and not to the
		 * table's list binding's 'dataReceived' method.
		 * @param {sap.ui.base.Event} oEvent the update finished event
		 * @public
		 */
		onUpdateFinished: function (oEvent) {
			// update the worklist's object counter after the table update
			var sTitle,
				oTable = oEvent.getSource(),
				iTotalItems = oEvent.getParameter("total");
			// only update the counter if the length is final and
			// the table is not empty
			if (iTotalItems && oTable.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("worklistTableTitleCount", [iTotalItems]);
			} else {
				sTitle = this.getResourceBundle().getText("worklistTableTitle");
			}
			this.getModel("worklistView").setProperty("/worklistTableTitle", sTitle);
			this.getModel("worklistView").setProperty("/searched", oEvent.getParameter("reason") !== "Refresh");
		},

		vendorNameChange: function (oEvent) {
			var btnSearch = this.getView().byId("btnSearch");

			if (btnSearch) {
				btnSearch.setEnabled(!!oEvent.getParameter("newValue") && oEvent.getParameter("newValue").length > 2);
			}
		},

		_showCompanySelectDialog: function () {

			if (!this._oCompanySelectDialog) {
				this._oCompanySelectDialog = sap.ui.xmlfragment("req.vendor.codan.fragments.CompanySelect", this);
				this.getView().addDependent(this._oCompanySelectDialog);
			}

			this._oCompanySelectDialog.open();
			sap.ui.getCore().byId("company").setValueState(ValueState.None);
		},
		
		closeCompanyCodeSelectDialog: function() {
			
			if (!this.getModel("worklistView").getProperty("/companyCode")) {
				sap.ui.getCore().byId("company").setValueState(ValueState.Error);
				return;
			}
			if (this._oCompanySelectDialog) {
				this._oCompanySelectDialog.close();
			}
			
			this.saveCompanyCodeParam();
			
		},
		
		saveCompanyCodeParam: function() {
			
			this.oCommonModel.create("/AppParameters", {
				application: "VENDOR_REQ",
				name: "COMPANYCODE",
				value: this.getModel("worklistView").getProperty("/companyCode")
			});
			
			this.oCommonModel.submitChanges();

		}

	});
});