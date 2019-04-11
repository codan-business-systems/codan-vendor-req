sap.ui.define([
	"req/vendor/codan/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/m/MessageBox",
	"sap/m/MessagePopover",
	"sap/m/MessagePopoverItem",
	"sap/ui/core/MessageType",
	"sap/ui/core/message/Message"
], function (BaseController, JSONModel, Filter, MessageBox, MessagePopover, MessagePopoverItem, MessageType, Message) {
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
			}

		},

		oMessageManager: {},

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
			this.getRouter().getRoute("newVendor").attachPatternMatched(this._onNewVendor, this);

			// Initialise the message manager
			this.oMessageManager = sap.ui.getCore().getMessageManager();
			this.setModel(this.oMessageManager.getMessageModel(), "message");

			this.oMessageManager.registerObject(this.getView(), true);

		},

		/**
		 * Binds the view to the object path.
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		_onObjectMatched: function (oEvent) {
			this._sVendorId = oEvent.getParameter("arguments").id;

			this.getModel("detailView").setProperty("/existingVendor", !!this._sVendorId);
			this.getModel("detailView").setProperty("/editBankDetails", !this._sVendorId);

			// Create a new request but only populate it with the Vendor Details.
			// The create should populate the vendor details
			// A request ID will only be assigned when the edit is made and a save is done
			this._setBusy(true);
			this.getModel().metadataLoaded().then(function () {
				this.getModel().create("/Requests", {
					vendorId: this._sVendorId
				}, {
					success: function (data) {
						this._sObjectPath = "/Requests('" + data.id + "')";

						this.getModel().read("/Vendors('" + this._sVendorId + "')/ToVendorOrgAssignments", {
							success: function (orgAssignments) {
								this.getModel("detailView").setProperty("/orgAssignments", orgAssignments.results);
								this._bindView(this._sObjectPath);
							}.bind(this)
						});

					}.bind(this)
				});

			}.bind(this));

			// Reset the edit mode
			this.getModel("detailView").setProperty("/editMode", false);

		},

		/**
		 * Create a new request and binds the view
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		_onNewVendor: function () {

			var detailModel = this.getModel("detailView");

			detailModel.setProperty("/existingVendor", false);
			detailModel.setProperty("/editBankDetails", true);
			detailModel.setProperty("/editMode", true);

			this.getModel().metadataLoaded().then(function () {
				this._oBindingContext = this.getModel().createEntry("/Requests", {});
				this._sObjectPath = this._oBindingContext.getPath();
				this.getView().setBindingContext(this._oBindingContext);
			}.bind(this));

			this._setBusy(true);
			this.getModel().read("/Vendors('')/ToVendorOrgAssignments", {
				success: function (orgAssignments) {
					this.getModel("detailView").setProperty("/orgAssignments", orgAssignments.results);
					this._setBusy(false);
				}.bind(this)
			});

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
					dataReceived: function () {
						oViewModel.setProperty("/busy", false);
					}
				}
			});

		},

		onSubmit: function () {

			// TODO: Validate Req
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

			// TODO: Check for unsaved changes
			this._navBack();

		},

		onBankCountryChange: function (oEvent) {
			var bankCountry = oEvent.getParameter("newValue");

			this.byId("bankCountry").getBinding("items").filter(new Filter({
				path: 'filterValue1',
				operator: 'EQ',
				value1: bankCountry
			}));
		},

		onBankKeyChange: function (oEvent) {
			var bankKey = oEvent.getParameter("newValue");

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

		_onBindingChange: function () {
			var oView = this.getView(),
				oViewModel = this.getModel("detailView"),
				oElementBinding = oView.getElementBinding();

			// No data for the binding
			if (!oElementBinding.getBoundContext()) {
				this.getRouter().getTargets().display("objectNotFound");
				return;
			}

			var oResourceBundle = this.getResourceBundle(),
				oObject = oView.getBindingContext().getObject(),
				sObjectId = oObject.customer,
				sObjectName = oObject.customer;

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
				req = model.getProperty(this._sObjectPath);

			if (bSubmit) {
				model.setProperty(this._sObjectPath + "/status", "N");
			}

			this._setBusy(true);

			// Merge the company assignments from the detail model
			req.ToOrgAssignments = this.getModel("detailView").getProperty("/orgAssignments");

			model.create("/Requests", req, {
				success: function (data) {
					MessageBox.success(this.getResourceBundle().getText("msgCreateSuccess", [data.id]), {
						title: "Success",
						onClose: function () {
							this._navBack();
						}.bind(this)
					});
					this._setBusy(false);
				}.bind(this),
				error: function (error) {
					// TODO: Error handling
				}
			});

		},

		_validateReq: function () {

			var messages = [];
			var req = this.getModel().getProperty(this._sObjectPath);
			this._resetMessages();

			// Name1 is mandatory
			if (!req.name1) {
				messages.push(new Message({
					message: "Name 1 is mandatory",
					description: "Enter the vendor's name",
					type: MessageType.Error,
					target: this._sObjectPath + "/name1",
					processor: this.getOwnerComponent().getModel()
				}));
			}

			// ABN is mandatory for AU vendors
			if (req.country === "AU" && !req.abn) {
				messages.push(new Message({
					message: "ABN is mandatory for AU companies",
					description: "Enter the ABN/Tax Number of the vendor",
					type: MessageType.Error,
					target: this._sObjectPath + "/abn",
					processor: this.getOwnerComponent().getModel()
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
		}

	});
});