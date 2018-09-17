sap.ui.define([
	"req/vendor/codan/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter"
], function (BaseController, JSONModel, Filter) {
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
				searched: false
			});

			this.setModel(oViewModel, "worklistView");

			// Make sure, busy indication is showing immediately so there is no
			// break after the busy indication for loading the view's meta data is
			// ended (see promise 'oWhenMetadataIsLoaded' in AppController)
			oTable.attachEventOnce("updateFinished", function () {
				// Restore original busy indicator delay for worklist's table
				oViewModel.setProperty("/tableBusyDelay", iOriginalBusyDelay);
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
				path: 'name',
				operator: sap.ui.model.FilterOperator.Contains,
				value1: searchString
			}));

		},
		
		/**
		 * Navigate to an existing vendor
		 * This may lead to a new request
		 * @public
		 */
		onSelectVendor: function(event) {
			this.getRouter().navTo("vendorFactSheet", {
				id: event.getParameter("selectedItem").getBindingContext().getProperty("id")
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
		
		vendorNameChange: function(oEvent) {
			var btnSearch = this.getView().byId("btnSearch");
			
			if (btnSearch) {
				btnSearch.setEnabled(!!oEvent.getParameter("newValue") && oEvent.getParameter("newValue").length > 2);
			}
		}

	});
});