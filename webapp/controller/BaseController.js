sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/routing/History"
], function (Controller, JSONModel, History) {
	"use strict";

	return Controller.extend("req.vendor.codan.controller.BaseController", {

		onInit: function () {
			
			if (Controller.prototype.onInit) {
				Controller.prototype.onInit.apply(this, arguments);
			}

		},

		/**
		 * Ensures the region filter on the specified control is set based on the selected Country key
		 * @param {Object} oControl control to change the binding on
		 * @param {string} sCountryKey Key of the country selected
		 * @public
		 */
		setRegionFilter: function (oControl, sCountryKey) {

			if (!oControl) {
				return;
			}

			var oBinding = oControl.getBinding("items");

			if (!oBinding) {
				return;
			}

			var aFilters = [];
			// Always start with a blank value
			aFilters.push(new sap.ui.model.Filter("country", sap.ui.model.FilterOperator.EQ, ""));

			// If a country key is passed, add that as well
			if (sCountryKey && sCountryKey !== "") {
				aFilters.push(new sap.ui.model.Filter("country", sap.ui.model.FilterOperator.EQ, sCountryKey));
			}

			oBinding.filter(new sap.ui.model.Filter({
				filters: aFilters,
				and: false
			}));

		},

		/**
		 * Convenience method for accessing the router.
		 * @public
		 * @returns {sap.ui.core.routing.Router} the router for this component
		 */
		getRouter: function () {
			return sap.ui.core.UIComponent.getRouterFor(this);
		},

		/**
		 * Convenience method for getting the view model by name.
		 * @public
		 * @param {string} [sName] the model name
		 * @returns {sap.ui.model.Model} the model instance
		 */
		getModel: function (sName) {
			return this.getView().getModel(sName);
		},

		/**
		 * Convenience method for setting the view model.
		 * @public
		 * @param {sap.ui.model.Model} oModel the model instance
		 * @param {string} sName the model name
		 * @returns {sap.ui.mvc.View} the view instance
		 */
		setModel: function (oModel, sName) {
			return this.getView().setModel(oModel, sName);
		},

		/**
		 * Getter for the resource bundle.
		 * @public
		 * @returns {sap.ui.model.resource.ResourceModel} the resourceModel of the component
		 */
		getResourceBundle: function () {
			return this.getOwnerComponent().getModel("i18n").getResourceBundle();
		},

		/**
		 * Event handler when the share button has been clicked
		 * @param {sap.ui.base.Event} oEvent the butten press event
		 * @public
		 */
		onSharePress: function () {
			var oShareSheet = this.byId("shareSheet");
			jQuery.sap.syncStyleClass(this.getOwnerComponent().getContentDensityClass(), this.getView(), oShareSheet);
			oShareSheet.openBy(this.byId("shareButton"));
		},

		/**
		 * Event handler when the share by E-Mail button has been clicked
		 * @public
		 */
		onShareEmailPress: function () {
			var oViewModel = (this.getModel("objectView") || this.getModel("worklistView"));
			sap.m.URLHelper.triggerEmail(
				null,
				oViewModel.getProperty("/shareSendEmailSubject"),
				oViewModel.getProperty("/shareSendEmailMessage")
			);
		},
		
		/**
		 * Navigate back to the Search screen
		 * @private
		 */
		_navBack: function() {

			var sPreviousHash = History.getInstance().getPreviousHash();

			if (sPreviousHash !== undefined) {
				history.go(-1);
			} else {
				this.getRouter().navTo("search", {}, true);
			}

		},

	});

});