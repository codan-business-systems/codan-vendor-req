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

		oDefault: {
			busy: false,
			editMode: false,
			existingVendor: false,
			orgAssignments: [],
			helpPopoverTitle: "",
			helpPopoverText: "",
			submitAction: "Submit for Approval",
			editBankDetails: false,
			bankDetailPopup: {
				bankVerifiedWithMsg: "",
				bankVerifiedTelMsg: ""
			},
			paymentMethods: [],
			bankDetailsLocked: false,
			banks: [],
			attachmentRequirements: [],
			allAttachmentRequirements: [],
			attachmentsRequired: false
		},

		oMessageManager: {},

		formatter: formatter,

		/**
		 * Called when the worklist controller is instantiated, sets initial
		 * values and initialises the model
		 * @public
		 */
		onInit: function () {
			var oViewModel;

			// Call the BaseController's onInit method (in particular to initialise the extra JSON models)
			BaseController.prototype.onInit.apply(this, arguments);

			// Model used to manipulate control states
			oViewModel = new JSONModel(this.oDefault);

			this.setModel(oViewModel, "detailView");

			this.getRouter().getRoute("vendorFactSheet").attachPatternMatched(this._onObjectMatched, this);
			this.getRouter().getRoute("changeRequest").attachPatternMatched(this._onChangeRequestMatched, this);
			this.getRouter().getRoute("newVendor").attachPatternMatched(this._onNewVendor, this);

			// Initialise the message manager
			this.oMessageManager = sap.ui.getCore().getMessageManager();
			this.setModel(this.oMessageManager.getMessageModel(), "message");

			this.oMessageManager.registerObject(this.getView(), true);

			this.getOwnerComponent().getModel("regions").setSizeLimit(9999);
			this.getOwnerComponent().getModel("countries").setSizeLimit(9999);
			this.getOwnerComponent().getModel().setSizeLimit(9999);
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

						this._resetAttachmentRequirements(this._sCompanyCode);
						this._readQuestions();
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
			this._sCompanyCode = oStartupParams.companyCode;
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
				this.setCurrentAttachmentRequirements();
			}

		},

		/**
		 * Create a new request and binds the view
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		_onNewVendor: function (oEvent) {

			var detailModel = this.getModel("detailView");
			this._sCompanyCode = oEvent.getParameter("arguments").companyCode;

			detailModel.setProperty("/existingVendor", false);
			detailModel.setProperty("/editBankDetails", false);
			detailModel.setProperty("/editMode", true);

			this._initialisePaymentMethods().then(function () {
				this._oBindingContext = this.getModel().createEntry("/Requests", {});
				this._sObjectPath = this._oBindingContext.getPath();
				this.getView().setBindingContext(this._oBindingContext);

				this.getModel().setProperty(this._sObjectPath + "/companyCode", this._sCompanyCode);
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
			var that = this;

			if (!this._validateReq()) {
				this.displayMessagesPopover();
				return;
			}

			// Show the questionnaire
			this._openQuestionnaireDialog();

		},

		continueSubmissionAfterQuestionnaire: function () {

			var that = this;

			// If this is a new bank, show the new bank dialog
			if (that.getModel().getProperty(that._sObjectPath + "/newBankNumber") &&
				!that.getModel().getProperty(that._sObjectPath + "/bankName")) {
				that._showNewBankDialog();
				return;
			}

			// If bank details are entered, raise the verify dialog
			if (that.getModel("detailView").getProperty("/editBankDetails")) {
				that._showVerifyBankDialog();
				return;
			}

			that._saveReq(true);
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
			var viewModel = this.getModel("detailView"),
				model = this.getModel(),
				editMode = viewModel.getProperty("/editMode"),
				that = this;

			if (editMode && model.hasPendingChanges()) {
				MessageBox.confirm("All changes will be reset.\n\nDo you wish to continue?", {
					title: "Data Loss Confirmation",
					onClose: function (sAction) {
						if (sAction === "OK") {
							model.resetChanges();
							viewModel.setProperty("/editMode", !editMode);
							that._resetMessages();
						}
					}
				});
			} else {
				viewModel.setProperty("/editMode", !editMode);
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
			var bankCountry = oEvent.getSource().getSelectedKey(),
				detailModel = this.getModel("detailView");

			sap.ui.core.BusyIndicator.show();

			this.getModel().read("/Banks", {
				filters: [
					new Filter({
						path: "countryKey",
						operator: FilterOperator.EQ,
						value1: bankCountry
					})
				],
				success: function (data) {
					var banks = data.results.map(function (o) {
						return Object.assign({}, o);
					});
					detailModel.setProperty("/banks", banks);
					sap.ui.core.BusyIndicator.hide();
				},
				error: function (data) {
					MessageBox.error("Error retrieving bank details", {
						title: "An error has occurred"
					});
				}
			});

			this.checkDuplicateBank();

			/*this.byId("bankKey").getBinding("suggestionItems").filter(new Filter({
				path: "filterValue",
				operator: "EQ",
				value1: bankCountry
			}));*/
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
			var model = this.getModel("detailView"),
				that = this;
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
							that.setCurrentAttachmentRequirements();
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

			var id = this.getModel().getProperty(this._sObjectPath).id,
				that = this,
				event = oEvent;

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
				value: id + ";" + oEvent.getParameter("mParameters").files[
					0].name
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

		showSaveConfirmation: function (oEvent) {
			var that = this;
			MessageBox.confirm("The request must be saved before uploading attachments.\n\nDo you wish to continue?", {
				title: "Save Required",
				onClose: function (sAction) {
					if (sAction === "OK") {
						that._saveReq(false, function () {
							//oEvent.getSource().setSupressUpload(false);
						});
					}
				}
			});
		},

		maskAccountKey: function (oEvent) {
			this.getModel().setProperty(this._sObjectPath + "/accountBankKey", this._formatBankKey(oEvent.getParameter("newValue"),
				this.getModel().getProperty(this._sObjectPath + "/accountCountry")));
		},

		checkAccountKey: function (oEvent) {

			oEvent.getSource().setValueState(ValueState.None);
			var model = this.getModel(),
				regex = new RegExp(/[^\s \(\)]+(?![^\(]*\))/),
				newBankKey = oEvent.getParameter("newValue").match(regex)[0],
				countryKey = model.getProperty(this._sObjectPath + "/accountCountry");

			newBankKey = this._formatBankKey(newBankKey, countryKey);
			model.setProperty(this._sObjectPath + "/accountBankKey", newBankKey);
			oEvent.getSource().setValue(newBankKey);

			var key = model.createKey("/Banks", {
				countryKey: countryKey,
				bankKey: newBankKey
			});

			var bank = model.getProperty(key);
			if (!bank) {
				oEvent.getSource().setValueState(ValueState.Warning);
				oEvent.getSource().setValueStateText("Bank account does not exist in SAP");
				model.setProperty(this._sObjectPath + "/newBankNumber", true);
				model.setProperty(this._sObjectPath + "/bankBranch", "");
				model.setProperty(this._sObjectPath + "/bankName", "");
			} else {
				model.setProperty(this._sObjectPath + "/newBankNumber", false);
				model.setProperty(this._sObjectPath + "/bankBranch", bank.branchName);
				model.setProperty(this._sObjectPath + "/bankName", bank.bankName);
			}

			this.checkDuplicateBank();

		},

		checkPaymentTerms: function (oEvent) {

			var model = this.getModel(),
				paymentTermsKey = oEvent.getParameter("newValue").substring(0, 4),
				valueHelpKey = model.createKey("/ValueHelpResults", {
					property: "PAYMENTTERMS",
					key: paymentTermsKey
				}),
				valueHelpObj = model.getProperty(valueHelpKey);

			oEvent.getSource().setValueState(ValueState.None);

			if (paymentTermsKey) {

				model.setProperty("/paymentTerms", paymentTermsKey);
				if (valueHelpObj) {
					model.setProperty("/paymentTermsText", valueHelpObj.value);
				} else {
					oEvent.getSource().setValueState(ValueState.Error);
					oEvent.getSource().setValueStateText("Payment terms are invalid");
					model.setProperty("/paymentTermsText", "");
				}

			}

		},

		_formatBankKey: function (sKey, sCountry) {
			if (sCountry !== "AU" || sKey.length < 3 || sKey.indexOf("-") >= 0) {
				return sKey;
			}

			if (sKey.length === 3) {
				return sKey + "-";
			} else {
				return sKey.substr(0, 3) + "-" + sKey.substr(3);
			}
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

		_saveReq: function (bSubmit, fOnSuccess) {

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

			// Merge Questions
			req.ToQuestions = this.getModel("detailView").getProperty("/Questions").map(function (q) {
				return Object.assign({}, q);
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

				if (fOnSuccess) {
					fOnSuccess();
				}
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
				description: "Enter the vendor's name",
				notForEmployees: false
			}, {
				name: "purchTel",
				shortText: "Purchasing Tel",
				description: "Enter a telephone number",
				notForEmployees: true
			}, {
				name: "purchEmail",
				shortText: "Purchasing Email",
				description: "Enter an email address",
				notForEmployees: true
			}, {
				name: "accountsTel",
				shortText: "Accounts Tel",
				description: "Enter a telephone number",
				notForEmployees: false
			}, {
				name: "accountsEmail",
				shortText: "Accounts Email",
				description: "Enter an email address",
				notForEmployees: false
			}, {
				name: "searchTerm",
				shortText: "Search Term",
				description: "Enter a search term",
				notForEmployees: false
			}, {
				name: "street",
				shortText: "Street",
				description: "Enter a street address",
				notForEmployees: false
			}, {
				name: "currency",
				shortText: "Currency",
				description: "Enter a currency for payments",
				notForEmployees: false
			}];

			// Check all mandatory fields
			mandatoryFields.forEach(function (o) {
				if (!req[o.name]) {
					if (o.notForEmployees && req.vendorType === "E") {
						return;
					}

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

			// Check that the payment terms are valid
			if (req.paymentTerms && !req.paymentTermsText) {
				messages.push(new Message({
					message: "Payment terms are invalid",
					description: "Select valid payment terms from the list",
					type: MessageType.Error,
					target: this._sObjectPath + "/paymentTerms",
					processor: this.getOwnerComponent().getModel()
				}));
			}

			// For the payment methods specified, check if bank details and/or address are required
			var paymentMethods = this.getModel("detailView").getProperty("/paymentMethods").filter(function (oPaymentMethod) {
				return oPaymentMethod.paymentMethodActive;
			});

			if (paymentMethods.length < 1) {
				messages.push(new Message({
					message: "Missing Payment method",
					description: "Select at least one payment method",
					type: MessageType.Error,
					target: that._sObjectPath + "/paymentMethods",
					processor: that.getOwnerComponent().getModel()
				}));
			} else {

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
			}

			// Payment method E is only valid for Australia
			if (this.getModel("detailView").getProperty("/editBankDetails") && paymentMethods.find(function (p) {
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
			if (this.getModel("detailView").getProperty("/editBankDetails") && paymentMethods.find(function (p) {
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

			// If there are attachment requirements, check that all have been marked as completed
			var attachmentRequirements = this.getModel("detailView").getProperty("/attachmentRequirements"),
				missingRequirements = attachmentRequirements.filter(function (o) {
					return !o.complete;
				});

			if (missingRequirements.length > 0) {
				messages.push(new Message({
					message: "Attachment Requirements have not been met",
					description: "Check the attachment requirements table, upload documents and mark the requirements as complete",
					type: MessageType.Error,
					processor: that.getOwnerComponent().getModel()
				}));
			}

			// Check Name, ABN and Bank Details are unique
			var nameField = this.getView().byId("name1");

			if (nameField && nameField.getValueState() === ValueState.Error) {
				messages.push(new Message({
					message: nameField.getValueStateText(),
					description: "Check that this vendor is not a duplicate",
					type: MessageType.Error,
					processor: that.getOwnerComponent().getModel()
				}));
			}

			var abnField = this.getView().byId("abn");

			if (abnField && abnField.getValueState() === ValueState.Error) {
				messages.push(new Message({
					message: abnField.getValueStateText(),
					description: "Check that this vendor is not a duplicate",
					type: MessageType.Error,
					processor: that.getOwnerComponent().getModel()
				}));
			}

			var bankField = this.getView().byId("accountNumber");

			if (bankField && bankField.getValueState() === ValueState.Error) {
				messages.push(new Message({
					message: bankField.getValueStateText(),
					description: "Check that this vendor is not a duplicate",
					type: MessageType.Error,
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

			if (this.getModel("detailView").getProperty("/editMode")) {
				this.oMessageManager.addMessages(new Message({
					message: "Submit the form when complete",
					description: "Update the fields that require changing. Once complete, press the Submit for Approval button.",
					type: MessageType.Information,
					target: "/Dummy",
					processor: this.getOwnerComponent().getModel()
				}));
			}
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
						filters: [
							new Filter({
								path: "companyCode",
								operator: "EQ",
								value1: that._sCompanyCode
							})
						],
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
		},

		_openQuestionnaireDialog: function () {

			if (!this._oQuestionDialog) {
				this._oQuestionDialog = sap.ui.xmlfragment("req.vendor.codan.fragments.Questionnaire", this);
				this.getView().addDependent(this._oQuestionDialog);
			}

			this._oQuestionDialog.open();
		},

		_showNewBankDialog: function () {
			if (!this._oNewBankDialog) {
				this._oNewBankDialog = sap.ui.xmlfragment("req.vendor.codan.fragments.NewBank", this);
				this.getView().addDependent(this._oNewBankDialog);
			}

			this._oNewBankDialog.open();

			this.setRegionFilter(sap.ui.getCore().byId("bankRegion"), this.getModel().getProperty(this._sObjectPath + "/accountCountry"));
		},

		newBankDialogCancel: function () {
			if (this._oNewBankDialog) {
				if (this._oNewBankDialog.close) {
					this._oNewBankDialog.close();
				}
				this._oNewBankDialog.destroy();
				delete this._oNewBankDialog;
			}
		},

		newBankDialogOk: function () {
			if (this.validateNewBankDialog()) {
				this.newBankDialogCancel();
				this.onSubmit();
			}
		},

		validateNewBankDialog: function () {
			var req = this.getModel().getProperty(this._sObjectPath),
				bankNameCtrl = sap.ui.getCore().byId("bankName"),
				bankSwiftCtrl = sap.ui.getCore().byId("bankSwift");

			bankNameCtrl.setValueState(req.bankName ? ValueState.None : ValueState.Error);
			bankNameCtrl.setValueStateText(req.bankName ? "" : "Bank Name is required");
			bankSwiftCtrl.setValueState(req.bankSwiftCode ? ValueState.None : ValueState.Error);
			bankSwiftCtrl.setValueStateText(req.bankSwiftCode ? "" : "Swift Code is required");

			return !!(req.bankName && req.bankSwiftCode);

		},

		questionnaireSelectionChange: function (event) {
			var sourcePath = event.getSource().getBindingContext("detailView").getPath(),
				newValue = event.getParameter("selectedIndex") === 1 ? "X" : "-",
				model = this.getModel("detailView");

			model.setProperty(sourcePath + "/yesNo", newValue);
			if (event.getParameter("selectedIndex") !== 1) {
				model.setProperty(sourcePath + "/responseText", "");
			}
			event.getSource().setValueState(ValueState.None);
		},

		closeQuestionnaireDialog: function (bSilent) {
			if (this._oQuestionDialog) {
				this._oQuestionDialog.close();
			}

			if (!bSilent || typeof bSilent !== "boolean") {
				MessageToast.show("Submission Cancelled", {
					duration: 5000
				});
			}
		},

		questionnaireOk: function (event) {
			if (this.validateQuestionnaire()) {
				this.closeQuestionnaireDialog(true);
				this.continueSubmissionAfterQuestionnaire();
			}
		},

		validateQuestionnaire: function (event) {
			var list = sap.ui.getCore().byId("questionList"),
				listItems = list.getItems(),
				result = true;

			listItems.forEach(function (l) {

				var q = l.getBindingContext("detailView").getObject(),
					rbg = l.getContent()[1],
					txt = l.getContent()[2];

				rbg.setValueState(ValueState.None);
				txt.setValueState(ValueState.None);

				if (formatter.questionMandatory(q.status)) {
					if (!q.yesNo && formatter.yesNoResponseRequired(q.responseType)) {
						rbg.setValueState(ValueState.Error);
						result = false;
					}

					if (q.responseType === "TXT" && !q.responseText) {
						txt.setValueState(ValueState.Error);
						txt.setValueStateText("Response required");
						result = false;
					}

				}

				if (q.responseType === "YNT" && q.yesNo === "X" && !q.responseText) {
					txt.setValueState(ValueState.Error);
					txt.setValueStateText("Response required");
					result = false;
				}
			});

			return result;
		},

		updateQuestionnaireResponseText: function (event) {
			this.getModel("detailView").setProperty(event.getSource().getBindingContext("detailView").getPath() + "/responseText", event.getParameter(
				"newValue"));
		},

		_readQuestions: function () {
			var detailModel = this.getModel("detailView"),
				model = this.getModel();

			model.read(this._sObjectPath + "/ToQuestions", {
				success: function (data) {
					var questions = data.results.map(function (q) {
						return Object.assign({}, q);
					});

					detailModel.setProperty("/Questions", questions);
				}
			});
		},

		_resetAttachmentRequirements: function (sCompCode) {

			var detailModel = this.getModel("detailView"),
				model = this.getModel(),
				that = this;

			detailModel.setProperty("/allAttachmentRequirements", []);

			model.read("/AttachmentRequirements", {
				filters: [
					new Filter({
						path: "compCode",
						operator: FilterOperator.EQ,
						value1: sCompCode
					})
				],
				success: function (data) {
					var attachmentRequirements = data.results;
					detailModel.setProperty("/allAttachmentRequirements", attachmentRequirements);
					that.setCurrentAttachmentRequirements();

				},
				error: function (err) {
					MessageBox.error("Error retrieving attachment requirements", {
						title: "An error has occurred"
					});
				}
			});
		},

		setCurrentAttachmentRequirements: function () {
			var detailModel = this.getModel("detailView"),
				allRequirements = detailModel.getProperty("/allAttachmentRequirements"),
				existingVendor = detailModel.getProperty("/existingVendor"),
				editBankDetails = detailModel.getProperty("/editBankDetails"),
				attachmentRequirements = allRequirements.filter(function (o) {
					return (!existingVendor && o.newRequest) ||
						(editBankDetails && o.bankChange) ||
						(existingVendor && o.otherChange);
				})
				.map(function (o) {
					return Object.assign({
						complete: false
					}, o);
				});

			detailModel.setProperty("/attachmentRequirements", attachmentRequirements);
			detailModel.setProperty("/attachmentsRequired", attachmentRequirements.length > 0);
		},

		editBankDetailsChange: function (event) {
			this.setCurrentAttachmentRequirements();
		},

		checkDuplicateAbn: function (event) {
			var abn = event.getParameter("newValue"),
				currentVendor = this._sVendorId,
				source = event.getSource();

			if (!abn || event.getSource().getValueState() !== ValueState.Success) {
				return;
			}

			this.getModel().callFunction("/DuplicateAbnCheck", {
				urlParameters: {
					"abn": abn,
					"currentVendor": currentVendor || ""
				},
				success: function (data) {
					if (!data.id) {
						return;
					}

					source.setValueState(ValueState.Error);
					source.setValueStateText("A Vendor (" + data.id + ") already exists with this ABN");
				},
				error: function (err) {
					MessageBox.error("Error checking duplicate ABN", {
						title: "An error has occurred"
					});
				}
			});
		},

		checkDuplicateName: function (event) {
			var name = event.getParameter("newValue"),
				currentVendor = this._sVendorId,
				source = event.getSource();

			if (!name) {
				return;
			}

			source.setValueState(ValueState.None);

			this.getModel().callFunction("/DuplicateNameCheck", {
				urlParameters: {
					"name": name,
					"currentVendor": currentVendor || ""
				},
				success: function (data) {
					if (!data.id) {
						return;
					}

					source.setValueState(ValueState.Error);
					source.setValueStateText("A Vendor (" + data.id + ") already exists with this name");
				},
				error: function (err) {
					MessageBox.error("Error checking duplicate name", {
						title: "An error has occurred"
					});
				}
			});
		},

		checkDuplicateBank: function () {
			var model = this.getModel(),
				req = model.getProperty(this._sObjectPath),
				currentVendor = this._sVendorId,
				source = this.getView().byId("accountNumber");

			source.setValueState(ValueState.None);

			if (!req.accountBankKey || !req.accountCountry || !req.accountNumber) {
				return;
			}

			model.callFunction("/DuplicateBankCheck", {
				urlParameters: {
					"bankKey": req.accountBankKey,
					"bankAccount": req.accountNumber,
					"bankCountry": req.accountCountry,
					"currentVendor": currentVendor || ""
				},
				success: function (data) {
					if (!data.id) {
						return;
					}

					source.setValueState(ValueState.Error);
					source.setValueStateText("A Vendor (" + data.id + ") already exists with these bank details");
				},
				error: function (err) {
					MessageBox.error("Error checking duplicate bank details", {
						title: "An error has occurred"
					});
				}
			});
		}
	});
});