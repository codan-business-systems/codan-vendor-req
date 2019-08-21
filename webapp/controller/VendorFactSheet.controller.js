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
	"req/vendor/codan/model/postcodeValidator"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox, MessagePopover, MessagePopoverItem, MessageType, Message,
	MessageToast, postcodeValidator) {
	"use strict";

	return BaseController.extend("req.vendor.codan.controller.VendorFactSheet", {

		oDefault: {
			busy: false,
			editMode: false,
			existingVendor: false,
			orgAssignments: [],
			helpPopoverTitle: "",
			helpPopoverText: "",
			submitAction: "Submit for Approval",
			editBankDetails: true,
			bankDetailPopup: {
				bankVerifiedWithMsg: "",
				bankVerifiedTelMsg: ""
			},
			paymentMethods: [],
			bankDetailsLocked: false
		},

		oMessageManager: {},

		/**
		 * Called when the worklist controller is instantiated, sets initial
		 * values and initialises the model
		 * @public
		 */
		onInit: function () {
			var oViewModel;
			var that = this;

			// Call the BaseController's onInit method (in particular to initialise the extra JSON models)
			BaseController.prototype.onInit.apply(this, arguments);

			// Model used to manipulate control states
			oViewModel = new JSONModel(this.oDefault);

			this.setModel(oViewModel, "detailView");

			this.getRouter().getRoute("vendorFactSheet").attachPatternMatched(this._onObjectMatched, this);
			this.getRouter().getRoute("changeRequest").attachPatternMatched(this._onChangeRequestMatched, this);
			this.getRouter().getRoute("newVendor").attachPatternMatched(this._onNewVendor, this);

			// Initialise the payment methods
			this._initialisePaymentMethods();

			// Initialise the message manager
			this.oMessageManager = sap.ui.getCore().getMessageManager();
			this.setModel(this.oMessageManager.getMessageModel(), "message");

			this.oMessageManager.registerObject(this.getView(), true);

			this.getOwnerComponent().getModel("regions").setSizeLimit(9999);
			this.getOwnerComponent().getModel("countries").setSizeLimit(9999);
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

			this.getModel("detailView").setProperty("/existingVendor", !!this._sVendorId);
			this.getModel("detailView").setProperty("/editBankDetails", !this._sVendorId);

			// Create a new request but only populate it with the Vendor Details.
			// The create should populate the vendor details
			// A request ID will only be assigned when the edit is made and a save is done
			this._setBusy(true);
			this._initialisePaymentMethods().then(function () {
				this.getModel().create("/Requests", {
					vendorId: this._sVendorId,
					companyCode: this._sCompanyCode
				}, {
					success: function (data) {
						this._sObjectPath = "/Requests('" + data.id + "')";
						this._parsePaymentMethods(data);
						this.resetRegionFilters(data.country);

						this._bindView(this._sObjectPath);
						this._setBusy(false);

					}.bind(this)
				});

			}.bind(this));

			// Reset the edit mode
			this.getModel("detailView").setProperty("/editMode", false);

		},

		countryChange: function (oEvent) {
			this.resetRegionFilters(oEvent.getSource().getSelectedKey());
		},

		resetRegionFilters: function (sCountry) {
			this.setRegionFilter(this.getView().byId("region"), sCountry);
			this.setRegionFilter(this.getView().byId("poBoxRegion"), sCountry);
		},

		_onChangeRequestMatched: function (oEvent) {
			var oStartupParams = oEvent.getParameter("arguments");

			if (!oStartupParams || !oStartupParams.id) {
				return;
			}
			this._sRequestId = oStartupParams.id;
			this._setBusy(true);

			this.getModel("detailView").setProperty("/existingVendor", true);
			this.getModel("detailView").setProperty("/editBankDetails", false);
			this.getModel("detailView").setProperty("/editMode", true);

			this._initialisePaymentMethods().then(function () {
				this._sObjectPath = "/" + this.getOwnerComponent().getModel().createKey("Requests", {
					id: this._sRequestId
				});
				this._bindView(this._sObjectPath);
			}.bind(this));

		},

		_parsePaymentMethods: function (data) {

			var oDetailModel = this.getModel("detailView"),
				aPaymentMethods = oDetailModel.getProperty("/paymentMethods");
			aPaymentMethods = aPaymentMethods.map(function (o) {
				o.paymentMethodActive = !!data.paymentMethods && data.paymentMethods.indexOf(o.paymentMethodCode) >= 0;
				return o;
			});
			oDetailModel.setProperty("/paymentMethods", aPaymentMethods);

			// Bank details are present, set the modify bank details switch to on
			if (data.accountBankKey) {
				oDetailModel.setProperty("/editBankDetails", true);
			}

		},

		/**
		 * Create a new request and binds the view
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		_onNewVendor: function (oEvent) {

			var detailModel = this.getModel("detailView"),
				companyCode = oEvent.getParameter("arguments").companyCode;

			detailModel.setProperty("/existingVendor", false);
			detailModel.setProperty("/editBankDetails", true);
			detailModel.setProperty("/editMode", true);

			this.getModel().metadataLoaded().then(function () {
				this._oBindingContext = this.getModel().createEntry("/Requests", {});
				this._sObjectPath = this._oBindingContext.getPath();
				this.getView().setBindingContext(this._oBindingContext);

				this.getModel().setProperty(this._sObjectPath + "/companyCode", companyCode);
			}.bind(this));

		},

		showBankDetailsHelp: function (event) {
			if (!this._oHelpPopover) {
				this._oHelpPopover = sap.ui.xmlfragment("req.vendor.codan.fragments.HelpPopover", this);
				this.getView().addDependent(this.oHelpPopover);
			}

			var oModel = this.getModel("detailView"),
				title = this.getResourceBundle().getText("bankDetailsHelpTitle");

			oModel.setProperty("/helpPopoverTitle", title);
			oModel.setProperty("/helpPopoverText", "Some Text");

			this._oHelpPopover.setTitle(title);

			sap.ui.getCore().byId("helpPopoverText").setValue(this.getResourceBundle().getText("bankDetailsHelpText"));

			this._oHelpPopover.openBy(event.getSource());

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
						this._parsePaymentMethods(data.getParameter ? data.getParameter("data") : data);
					}.bind(this)
				}
			});

		},

		onSubmit: function () {

			if (!this._validateReq()) {
				this.displayMessagesPopover();
				return;
			}
			// If bank details are entered, raise the verify dialog
			if (this.getModel("detailView").getProperty("/editBankDetails")) {
				this._showVerifyBankDialog();
				return;
			}

			this._saveReq(true);
		},

		onSave: function () {
			this._saveReq(false);
		},

		bankDetailsVerified: function () {
			var model = this.getModel(),
				detailModel = this.getModel("detailView"),
				bankDetailPopup = detailModel.getProperty("/bankDetailPopup") || {
					bankVerifiedWithMsg: "",
					bankVerifiedTelMsg: ""
				},
				bCancel = false;

			if (!model.getProperty(this._sObjectPath + "/bankVerifiedWith")) {
				bankDetailPopup.bankVerifiedWithMsg = this.getResourceBundle().getText("msgEnterBankVerifiedWith");
				bCancel = true;
			}

			if (!model.getProperty(this._sObjectPath + "/bankVerifiedTel")) {
				bankDetailPopup.bankVerifiedWithMsg = this.getResourceBundle().getText("msgEnterBankVerifiedTel");
				bCancel = true;
			}

			if (bCancel) {
				detailModel.setProperty("/bankDetailPopup");
				return;
			}

			this.cancelBankDetailsDialog();

			this._saveReq(true);
		},

		toggleEditMode: function () {
			var model = this.getModel("detailView"),
				editMode = model.getProperty("/editMode");

			// TODO: Check for changes and raise a confirmation

			model.setProperty("/editMode", !editMode);

			if (!editMode) {
				this._resetMessages();
			}

		},

		cancelBankDetailsDialog: function () {
			if (this._oBankDialog) {
				if (this._oBankDialog.close) {
					this._oBankDialog.close();
				}
				this._oBankDialog.destroy();
				delete this._oBankDialog;
			}

			this.getModel("detailView").setProperty("/bankDetailPopup", {
				bankVerifiedWithMsg: "",
				bankVerifiedTelMsg: ""
			});
		},

		onNavBack: function () {

			var that = this;

			var navBack = function () {
				that.getModel().resetChanges();
				that._navBack();
			};

			if (this.getModel("detailView").getProperty("/editMode") && this.getModel().hasPendingChanges()) {
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

		onBankCountryChange: function (oEvent) {
			var bankCountry = oEvent.getSource().getSelectedKey();

			this.byId("bankKey").getBinding("items").filter(new Filter({
				path: "filterValue",
				operator: "EQ",
				value1: bankCountry
			}));
		},

		displayMessagesPopover: function (oEvent) {
			var oMessagesButton = oEvent ? oEvent.getSource() : this.getView().byId("vendorFactSheetPage")
				.getAggregation("messagesIndicator").getAggregation("_control");

			if (!this._messagePopover) {
				this._messagePopover = new MessagePopover({
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
				oMessagesButton.addDependent(this._messagePopover);
			}

			if (oEvent || !this._messagePopover.isOpen()) {
				this._messagePopover.toggle(oMessagesButton);
			}

		},

		paymentMethodChange: function (oEvent) {
			var model = this.getModel("detailView");
			// Ignore if we are turning a payment method off
			if (!oEvent.getParameter("state")) {
				return;
			}

			// Check if bank details are required.
			var oContext = oEvent.getSource().getBindingContext("detailView"),
				oPaymentMethod = oContext.getObject();
			if (oPaymentMethod.bankDetailsReqdFlag) {
				MessageBox.confirm("Bank details are required for this payment method.\n\n OK to continue?", {
					title: "Confirm Bank Details",
					onClose: function (sAction) {
						if (sAction !== MessageBox.Action.OK) {
							model.setProperty(oContext.getPath() + "/paymentMethodActive", false);
						} else {
							model.setProperty("/editBankDetails", true);
							model.setProperty("/bankDetailsLocked", true);
						}
					}
				});
			}
		},

		employeeTypeChange: function (oEvent) {
			var vendorType = oEvent.getParameter("state") ? "E" : "";
			this.getModel().setProperty(this._sObjectPath + "/vendorType", vendorType);

			this.getView().byId("abnLabel").setVisible(vendorType !== "E");
			this.getView().byId("abn").setVisible(vendorType !== "E");
			this.getView().byId("filler2").setVisible(vendorType === "E");
			this.getView().byId("filler2Dummy").setVisible(vendorType === "E");
		},
		
		changeAttachment: function (oEvent) {
			var oModel = this.getModel(),
				upload = oEvent.getSource();
			oModel.refreshSecurityToken();

			upload.setUploadUrl("/sap/opu/odata/sap/Z_VENDOR_REQ_SRV/Attachments");
			upload.addHeaderParameter(new sap.m.UploadCollectionParameter({
				name: "x-csrf-token",
				value: oModel.getHeaders()["x-csrf-token"]
			}));
			upload.addHeaderParameter(new sap.m.UploadCollectionParameter({
				name: "slug",
				value: oModel.getProperty(this.getView().getElementBinding().getPath() + "/id") + ";" + oEvent.getParameter("mParameters").files[0].name
			}));
		},

		uploadComplete: function () {
			var attachments = this.getView().byId("attachments");

			var resetBusy = function () {
				this.getModel("detailView").setProperty("/attachmentsBusy", false);
			};

			if (attachments) {
				this.getModel().attachEventOnce("requestCompleted", resetBusy.bind(this), true);
				this.getModel("detailView").setProperty("/attachmentsBusy", true);
				attachments.getBinding("items").refresh();
			}
		},

		deleteAttachment: function (oEvent) {
			this.getModel().remove("/Attachments('" + oEvent.getParameter("documentId") + "')", {
				success: function (data) {
					sap.m.MessageToast.show(this.getResourceBundle().getText("msgAttachmentDeleted"), {
						duration: 5000
					});
				}.bind(this)
			});
		},


		_onBindingChange: function () {
			var oView = this.getView(),
				oViewModel = this.getModel("detailView"),
				oElementBinding = oView.getElementBinding();

			// No data for the binding
			if (!oElementBinding.getBoundContext()) {
				this.getRouter().getTargets().display("objectNotFound");
				return;
			}

			// Everything went fine.
			oViewModel.setProperty("/busy", false);

		},

		_setBusy: function (busy) {
			this.getModel("detailView").setProperty("/busy", busy);
		},

		_showVerifyBankDialog: function () {

			if (!this._oBankDialog) {
				this._oBankDialog = sap.ui.xmlfragment("req.vendor.codan.fragments.VerifyBankDetails", this);
				this.getView().addDependent(this._oBankDialog);
			}

			this._oBankDialog.open();

		},

		_saveReq: function (bSubmit) {

			var model = this.getModel(),
				req = model.getProperty(this._sObjectPath),
				id = req.id,
				bUpdateId = !id;

			if (bSubmit) {
				if (req.id) {
					req.status = "N";
				} else {
					model.setProperty(this._sObjectPath + "/status", "N");
					req.status = "N";
				}
			}

			this._setBusy(true);

			// Merge payment methods from the detail model
			req.paymentMethods = "";
			this.getModel("detailView").getProperty("/paymentMethods").forEach(function (o) {
				if (o.paymentMethodActive) {
					req.paymentMethods += o.paymentMethodCode;
				}
			});

			var fnSuccess = function (data) {

				// Ensure that the view is updated with the new req id.
				if (bUpdateId) {
					id = data.id;
					this._sObjectPath = "/" + model.createKey("Requests", {
						id: data.id
					});
					this._bindView(this._sObjectPath);
				}

				if (bSubmit) {
					model.resetChanges();
					MessageBox.success(this.getResourceBundle().getText("msgCreateSuccess", [id]), {
						title: "Success",
						onClose: function () {
							this._navBack();
						}.bind(this)
					});
				} else {
					MessageToast.show("Request has been saved successfully", {
						duration: 10000
					});
				}
				this._setBusy(false);
			}.bind(this);

			if (bUpdateId) {
				model.create("/Requests", req, {
					success: fnSuccess,
					error: function (error) {
						// TODO: Error handling
					}
				});
			} else {

				model.update(this._sObjectPath, req, {
					success: fnSuccess,
					error: function (error) {
						// TODO: Error handling
					}
				});
			}

		},

		_validateReq: function () {

			var messages = [];
			var req = this.getModel().getProperty(this._sObjectPath);
			var that = this;
			this.oMessageManager.removeAllMessages();
			var mandatoryFields = [{
				name: "name1",
				shortText: "Name 1",
				description: "Enter the vendor's name"
			}, {
				name: "purchTel",
				shortText: "Purchasing Tel",
				description: "Enter a telephone number"
			}, {
				name: "purchEmail",
				shortText: "Purchasing Email",
				description: "Enter an email address"
			}, {
				name: "accountsTel",
				shortText: "Accounts Tel",
				description: "Enter a telephone number"
			}, {
				name: "accountsEmail",
				shortText: "Accounts Email",
				description: "Enter an email address"
			}, {
				name: "searchTerm",
				shortText: "Search Term",
				description: "Enter a search term"
			}];

			// Check all mandatory fields
			mandatoryFields.forEach(function (o) {
				if (!req[o.name]) {
					messages.push(new Message({
						message: o.shortText + " is mandatory",
						description: o.description,
						type: MessageType.Error,
						target: that._sObjectPath + "/" + o.name,
						processor: that.getOwnerComponent().getModel()
					}));
				}
			});

			// ABN is mandatory for AU vendors
			if (req.country === "AU" && !req.abn && !req.vendorType === "E") {
				messages.push(new Message({
					message: "ABN is mandatory for AU companies",
					description: "Enter the ABN/Tax Number of the vendor",
					type: MessageType.Error,
					target: this._sObjectPath + "/abn",
					processor: this.getOwnerComponent().getModel()
				}));
			}
			
			// Check that the postcode is valid
			if (req.postcode && !postcodeValidator.validatePostcode(this.getModel("countries"), req.country, req.postcode)) {
				messages.push(new Message({
					message: "Postcode is invalid for country " + req.country,
					description: "Enter a valid postcode",
					type: MessageType.Error,
					target: this._sObjectPath + "/postcode",
					processor: this.getOwnerComponent().getModel()
				}));
			}

			// For the payment methods specified, check if bank details and/or address are required
			var paymentMethods = this.getModel("detailView").getProperty("/paymentMethods").filter(function (oPaymentMethod) {
				return oPaymentMethod.paymentMethodActive;
			});

			paymentMethods.forEach(function (oPaymentMethod) {
				if (oPaymentMethod.bankDetailsReqdFlag && (!req.hasBankDetails && (!req.accountBankKey || !req.accountNumber))) {
					messages.push(new Message({
						message: "Bank Account is mandatory for payment method" + oPaymentMethod.paymentMethodText,
						description: "Enter Bank Account details",
						type: MessageType.Error,
						target: that._sObjectPath + "/accountBankKey",
						processor: that.getOwnerComponent().getModel()
					}));
				}

				if (oPaymentMethod.addressReqdFlag && !req.street && !req.poBox) {
					messages.push(new Message({
						message: "Address is mandatory for payment method" + oPaymentMethod.paymentMethodText,
						description: "Enter Address details",
						type: MessageType.Error,
						target: that._sObjectPath + "/street",
						processor: that.getOwnerComponent().getModel()
					}));
				}
			});

			// Payment method E is only valid for Australia
			if (paymentMethods.find(function (p) {
					return p.paymentMethodCode === "E";
				}) && !req.accountCountry && req.accountCountry !== "AU") {
				messages.push(new Message({
					message: "Payment method E is only valid for AU Bank accounts",
					description: "Choose payment method F",
					type: MessageType.Error,
					target: that._sObjectPath + "/accountCountry",
					processor: that.getOwnerComponent().getModel()
				}));
			}

			// Payment method F is only valid for outside Australia
			if (paymentMethods.find(function (p) {
					return p.paymentMethodCode === "F";
				}) && !req.accountCountry && req.accountCountry === "AU") {
				messages.push(new Message({
					message: "Payment method F is only valid for non-AU Bank accounts",
					description: "Choose payment method E",
					type: MessageType.Error,
					target: that._sObjectPath + "/accountCountry",
					processor: that.getOwnerComponent().getModel()
				}));
			}

			if (messages.length > 0) {
				this.oMessageManager.addMessages(messages);
			}

			return messages.length === 0;
		},

		_resetMessages: function () {

			if (!this.oMessageManager) {
				return;
			}
			this.oMessageManager.removeAllMessages();
			this.oMessageManager.addMessages(new Message({
				message: "Submit the form when complete",
				description: "Update the fields that require changing. Once complete, press the Submit for Approval button.",
				type: MessageType.Information,
				target: "/Dummy",
				processor: this.getOwnerComponent().getModel()
			}));
		},

		_initialisePaymentMethods: function () {
			var that = this;
			return new Promise(function (resolve, reject) {
				that.getOwnerComponent().getModel().metadataLoaded().then(function () {
					if (that.getModel("detailView").getProperty("/paymentMethods").length > 0) {
						resolve();
						return;
					}

					that.getOwnerComponent().getModel().read("/PaymentMethods", {
						success: function (data) {
							var aPaymentMethods = data.results.map(function (o) {
								return {
									paymentMethodCode: o.paymentMethodCode,
									paymentMethodText: o.paymentMethodText,
									bankDetailsReqdFlag: o.bankDetailsReqdFlag,
									addressReqdFlag: o.addressReqdFlag,
									paymentMethodActive: false
								};
							});
							that.getModel("detailView").setProperty("/paymentMethods", aPaymentMethods);
							resolve();
						},
						error: reject
					});
				});
			});
		}
	});
});