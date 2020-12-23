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
			

		},

		/************************************ EVERYTHING BELOW HERE TO BE REMOVED ************************************/

		continueSubmissionAfterQuestionnaire: function () {

			var that = this;

			// If this is a new bank, show the new bank dialog
			if (that.getModel().getProperty(that._sObjectPath + "/newBankNumber") &&
				!that.getModel().getProperty(that._sObjectPath + "/bankName")) {
				that._showNewBankDialog();
				return;
			}

			var checkPromise = this._checkApproverRequired();
			checkPromise.then(function () {
				that._openApproverDialog();
			});

			checkPromise.catch(function () {
				var verifyPromise = that._checkBankVerifyRequired();

				verifyPromise.then(function () {
					// If bank details are entered, raise the verify dialog
					that._showVerifyBankDialog();
				});

				verifyPromise.catch(function () {
					that._saveReq(true);
				});
			});

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
				that = this,

				changeEditMode = function () {
					viewModel.setProperty("/editMode", !editMode);
					that._resetMessages();
				};

			if (!editMode && model.getProperty(this._sObjectPath + "/vendorDeletionFlag")) {
				MessageBox.confirm("The vendor is currently deleted.\n\nDo you wish to request it be reinstated?", {
					title: "Vendor Deleted",
					onClose: function (sAction) {
						if (sAction === "OK") {
							changeEditMode();
						}
					}
				});
			} else if (editMode && model.hasPendingChanges()) {
				MessageBox.confirm("All changes will be reset.\n\nDo you wish to continue?", {
					title: "Data Loss Confirmation",
					onClose: function (sAction) {
						if (sAction === "OK") {
							model.resetChanges();
							changeEditMode();
						}
					}
				});
			} else {
				changeEditMode();
			}

		},

		cancelBankDetailsDialog: function () {
			if (this._oBankDialog) {
				if (this._oBankDialog.close) {
					this._oBankDialog.close();
				}
			}

			this.getModel("detailView").setProperty("/bankDetailPopup", {
				bankVerifiedWithMsg: "",
				bankVerifiedTelMsg: ""
			});
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
					sap.ui.core.BusyIndicator.hide();
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

			// If we are turning a payment method off, check that there is at least one payment method active
			// that requires bank details
			if (!oEvent.getParameter("state")) {
				if (model.getProperty("/bankDetailsLocked")) {
					var aPaymentMethods = model.getProperty("/paymentMethods").filter(function (o) {
						return o.bankDetailsReqdFlag && o.paymentMethodActive;
					});

					if (aPaymentMethods.length < 1) {
						model.setProperty("/bankDetailsLocked", false);
					}
				}
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
				oModel = this.getModel(),
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
						that._saveReq(false);
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

			var detailModel = this.getModel("detailView"),
				model = this.getModel(),
				paymentTermsKey = oEvent.getParameter("newValue") && oEvent.getParameter("newValue").split(" ")[0],
				valueHelpObj = detailModel.getProperty("/paymentTerms").find(function (o) {
					return o.paymentTermsKey === paymentTermsKey;
				});

			oEvent.getSource().setValueState(ValueState.None);

			model.setProperty(this._sObjectPath + "/paymentTerms", paymentTermsKey);

			if (paymentTermsKey) {
				if (valueHelpObj && valueHelpObj.selectable) {
					model.setProperty(this._sObjectPath + "/paymentTermsText", valueHelpObj.paymentTermsText);
					model.setProperty(this._sObjectPath + "/paymentTermsWarning", valueHelpObj.warning);

					if (valueHelpObj.warning) {
						oEvent.getSource().setValueState(ValueState.Warning);
						oEvent.getSource().setValueStateText("Payment terms are less than our standard payment terms.");
					}
				} else {
					oEvent.getSource().setValueState(ValueState.Error);
					oEvent.getSource().setValueStateText("Payment terms are invalid");
					model.setProperty(this._sObjectPath + "/paymentTermsText", "");
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

		_showVerifyBankDialog: function () {

			if (!this._oBankDialog) {
				this._oBankDialog = sap.ui.xmlfragment("req.vendor.codan.fragments.VerifyBankDetails", this);
				this.getView().addDependent(this._oBankDialog);
			}

			this._oBankDialog.open();

		},

		_saveReq: function (bSubmit) {

			var that = this;

			return new Promise(function (res, rej) {

				var model = that.getModel(),
					detailModel = that.getModel("detailView"),
					req = model.getProperty(that._sObjectPath),
					id = req.id,
					bUpdateId = !id;

				if (!that._validateOnSave(req)) {
					that.displayMessagesPopover();
					return;
				}

				if (detailModel.getProperty("/changeRequestMode")) {
					if (detailModel.getProperty("/significantChange") || (!req.status && bSubmit)) {
						req.status = "N";
					}
				} else {

					if (bSubmit) {
						if (req.id) {
							req.status = "N";
						} else {
							model.setProperty(this._sObjectPath + "/status", "N");
							req.status = "N";
						}
					}

				}

				that._setBusy(true);

				// Merge payment methods from the detail model
				req.paymentMethods = "";
				detailModel.getProperty("/paymentMethods").forEach(function (o) {
					if (o.paymentMethodActive) {
						req.paymentMethods += o.paymentMethodCode;
					}
				});

				// Merge Questions
				if (!id) {
					req.ToQuestions = detailModel.getProperty("/questions").map(function (q) {
						var result = Object.assign({}, q);
						delete result.complete;
						delete result.visible;
						return result;
					});
				} else if (!detailModel.getProperty("/changeRequestMode")) {

					detailModel.getProperty("/questions").forEach(function (q) {
						var questionKey = model.createKey("/Questions", {
							requestId: id,
							questionId: q.questionId
						});

						var question = {
							requestId: id,
							questionId: q.questionId,
							yesNo: q.yesNo,
							responseText: q.responseText,
							questionText: q.questionText,
							responseType: q.responseType,
							role: q.role,
							status: q.status
						};

						model.update(questionKey, question);

					});

				}

				var fnSuccess = function (data) {

					// Ensure that the view is updated with the new req id.
					if (bUpdateId) {
						id = data.id;
						that._sObjectPath = "/" + model.createKey("Requests", {
							id: data.id
						});
						that._bindView(that._sObjectPath);
					}

					if (bSubmit) {
						model.resetChanges();
						var successMessage = detailModel.getProperty("/changeRequestMode") ? "The request has been resubmitted for approval" :
							that.getResourceBundle().getText("msgCreateSuccess", [id]);
						MessageBox.success(successMessage, {
							title: "Success",
							onClose: function () {
								that._navBack();
							}
						});
					} else {
						MessageToast.show("Request has been saved successfully", {
							duration: 10000
						});
					}
					that._setBusy(false);

					res();
				};

				if (bUpdateId) {
					model.create("/Requests", req, {
						success: fnSuccess,
						error: function (error) {
							MessageBox.error("Error saving request", {
								title: "An error has occurred"
							});
							rej();
						}
					});
				} else {

					delete req.ToApprovals;
					delete req.ToQuestions;

					model.update(that._sObjectPath, req, {
						success: fnSuccess,
						error: function (error) {
							MessageBox.error("Error updating request", {
								title: "An error has occurred"
							});
							rej();
						}
					});
				}

			});

		},

		_validateOnSave: function () {

			var messages = [];
			this.oMessageManager.removeAllMessages();

			// Check that the ABN (if specified) is not in error
			var abnInput = this.getView().byId("abn");
			if (abnInput && abnInput.getValueState() === ValueState.Error) {
				messages.push(new Message({
					message: abnInput.getValueStateText(),
					description: "Modify the ABN/Tax Number of the vendor",
					type: MessageType.Error,
					target: this._sObjectPath + "/abn",
					processor: this.getOwnerComponent().getModel()
				}));
			}

			// Check that the name is valid
			var name1 = this.getView().byId("name1");
			if (name1 && name1.getValueState() === ValueState.Error) {
				messages.push(new Message({
					message: name1.getValueStateText(),
					description: "Check that this vendor does not already exist",
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
				name: "currency",
				shortText: "Currency",
				description: "Enter a currency for payments",
				notForEmployees: false
			}, {
				name: "country",
				shortText: "Country",
				description: "Enter address country",
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
			if (req.country === "AU" && !req.abn && req.vendorType !== "E") {
				messages.push(new Message({
					message: "ABN is mandatory for AU companies",
					description: "Enter the ABN of the vendor",
					type: MessageType.Error,
					target: this._sObjectPath + "/abn",
					processor: this.getOwnerComponent().getModel()
				}));
			}

			// Tax number mandatory for US companies in 4300
			if (req.companyCode === "4300" && req.vendorType !== "E" && !req.abn) {
				messages.push(new Message({
					message: "Tax Number is mandatory for US companies",
					description: "Enter the Tax Number of the vendor",
					type: MessageType.Error,
					target: this._sObjectPath + "/abn",
					processor: this.getOwnerComponent().getModel()
				}));
			}

			// Company Structure mandatory for US companies in 4300.
			var compStruct = this.getView().byId("companyStructure");
			if (compStruct && compStruct.getVisible()) {
				if (!req.existingVendor && (!req.companyStructureCode || Number(req.companyStructureCode) >= 90)) {
					messages.push(new Message({
						message: "Company Structure selection required" + req.country,
						description: "Select company structure from W-9 form",
						type: MessageType.Error,
						target: this._sObjectPath + "/companyStructureCode",
						processor: this.getOwnerComponent().getModel()
					}));
				}
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

			// Check that the email addresses are valid
			if (!formatter.validateEmail(req.accountsEmail)) {
				messages.push(new Message({
					message: "Accounts email address is invalid",
					description: "Enter a valid email address",
					type: MessageType.Error,
					target: this._sObjectPath + "/accountsEmail",
					processor: this.getOwnerComponent().getModel()
				}));
			}

			if (!formatter.validateEmail(req.purchEmail)) {
				messages.push(new Message({
					message: "Purchasing email address is invalid",
					description: "Enter a valid email address",
					type: MessageType.Error,
					target: this._sObjectPath + "/purchEmail",
					processor: this.getOwnerComponent().getModel()
				}));
			}

			// Check that the phone numbers are valid
			if (!formatter.validatePhone(req.purchTel)) {
				messages.push(new Message({
					message: "Purchasing telephone is invalid",
					description: "Enter numbers and spaces only",
					type: MessageType.Error,
					target: this._sObjectPath + "/purchTel",
					processor: this.getOwnerComponent().getModel()
				}));
			}

			// Check that the phone numbers are valid
			if (!formatter.validatePhone(req.accountsTel)) {
				messages.push(new Message({
					message: "Accounts telephone is invalid",
					description: "Enter numbers and spaces only",
					type: MessageType.Error,
					target: this._sObjectPath + "/accountsTel",
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
				}) && req.accountCountry && req.accountCountry !== "AU") {
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
				})) {
				if (req.accountCountry && req.accountCountry === "AU") {
					messages.push(new Message({
						message: "Payment method F is only valid for non-AU Bank accounts",
						description: "Choose payment method E",
						type: MessageType.Error,
						target: that._sObjectPath + "/accountCountry",
						processor: that.getOwnerComponent().getModel()
					}));
				}

				if (!req.bankSwiftCode) {
					messages.push(new Message({
						message: "Payment method F requires a SWIFT key",
						description: "Enter a SWIFT key",
						type: MessageType.Error,
						target: that._sObjectPath + "/bankSwiftCode",
						processor: that.getOwnerComponent().getModel()
					}));
				}
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
			} else {

				var uploadCollection = this.getView().byId("attachments");

				if (uploadCollection && uploadCollection.getItems().length === 0 && attachmentRequirements.length !== 0) {
					messages.push(new Message({
						message: "No attachments have been uploaded",
						description: "There are no attachments, but there are mandatory attachment requirements. Upload the required documentation",
						type: MessageType.Error,
						processor: that.getOwnerComponent().getModel()
					}));
				}

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

			if (abnField && abnField.getVisible() && abnField.getValueState() === ValueState.Error) {
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

		_checkPaymentTermsJustification: function () {

			var that = this;

			return new Promise(function (res, rej) {
				if (that.getModel().getProperty(that._sObjectPath + "/paymentTermsWarning")) {

					that._paymentTermsOK = false;

					that._oPaymentTermsJustificationDialog.attachAfterClose(function (event) {
						if (that._paymentTermsOK) {
							res();
						} else {
							rej();
						}
					}, this);

					that._oPaymentTermsJustificationDialog.open();
				} else {
					res();
				}
			});

		},

		_openQuestionnaireDialog: function () {

			if (!this._oQuestionDialog) {
				this._oQuestionDialog = sap.ui.xmlfragment("req.vendor.codan.fragments.Questionnaire", this);
				this.getView().addDependent(this._oQuestionDialog);
			}

			this.setCurrentQuestions();

			this._oQuestionDialog.open();
		},

		okPaymentTermsDialog: function (event) {
			if (!this.getModel().getProperty(this._sObjectPath + "/paymentTermsJustificationText")) {
				var textArea = sap.ui.getCore().byId("paymentTermsJustificationText"),
					message = "Enter a justification for the payment terms selection";

				if (textArea) {
					textArea.setValueState(ValueState.Error);
					textArea.setValueStateText(message);
				} else {
					MessageBox.error(message);
				}
			} else {
				this._paymentTermsOK = true;
				this._oPaymentTermsJustificationDialog.close();
			}
		},

		closePaymentTermsDialog: function (event) {
			this._oPaymentTermsJustificationDialog.close();
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
			}
		},

		newBankDialogOk: function () {
			if (this.validateNewBankDialog()) {
				this.newBankDialogCancel();
				this.continueSubmissionAfterQuestionnaire();
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
				sourceQuestion = event.getSource().getBindingContext("detailView").getObject(),
				newValue = event.getParameter("selectedIndex") === 1 ? "X" : "-",
				model = this.getModel("detailView"),
				questions = model.getProperty("/questions");

			model.setProperty(sourcePath + "/yesNo", newValue);
			if (event.getParameter("selectedIndex") !== 1) {
				model.setProperty(sourcePath + "/responseText", "");
			}
			event.getSource().setValueState(ValueState.None);

			// Check if any questions have this question as their parent
			var children = model.getProperty("/allQuestions").filter(function (o) {
				return o.parentQuestion === sourceQuestion.questionId;
			});

			if (children.length > 0) {
				children.forEach(function (o) {
					var question = questions.find(function (q) {
						return q.questionId === o.questionId;
					});

					if (!question) {
						questions.push(o);
						question = questions[questions.length - 1];
					}
					question.visible = o.status && o.parentQuestionResponse === newValue;
				});

				sap.ui.getCore().byId("questionList").getBinding("items").refresh(true);
			}
		},

		closeQuestionnaireDialog: function (bSilent) {

			var that = this;
			if (this._oQuestionDialog) {
				this._oQuestionDialog.close();
			}

			if (!bSilent || typeof bSilent !== "boolean") {
				that._setBusy(false);
				MessageToast.show("Submission Cancelled", {
					duration: 5000
				});
			}
		},

		questionnaireOk: function (event) {
			var that = this;
			if (this.validateQuestionnaire()) {
				this.closeQuestionnaireDialog(true);
				this._saveReq(false).then(function () {
					that.continueSubmissionAfterQuestionnaire();
				});
			}
		},

		validateQuestionnaire: function (event) {
			var list = sap.ui.getCore().byId("questionList"),
				listItems = list.getItems(),
				result = true,
				that = this;

			listItems.forEach(function (l) {

				var q = l.getBindingContext("detailView").getObject(),
					rbg = "",

					findInput = function (i) {
						if (i.getValueState && i.getVisible && i.getVisible()) {
							rbg = i;
							return true;
						}

						return i.getItems && i.getItems().find(findInput);
					},

					// Find the radio button group or checkbox 
					txt = l.getContent()[2];

				if (l.getContent().find(findInput)) {
					rbg.setValueState(ValueState.None);
				}

				if (txt) {
					txt.setValueState(ValueState.None);
				}

				if (that.formatter.questionMandatory(q.status)) {
					if (!q.yesNo && (that.formatter.yesNoResponseRequired(q.responseType) || q.responseType === "CHK")) {
						rbg.setValueState(ValueState.Error);
						result = false;
					}

					if (q.responseType === "TXT" && !q.responseText) {
						txt.setValueState(ValueState.Error);
						txt.setValueStateText("Response required");
						result = false;
					}

				}

				if (formatter.responseTextEnabled(q.responseType, q.yesNo) && !q.responseText) {
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

		setCurrentQuestions: function () {
			var detailModel = this.getModel("detailView"),
				allQuestions = detailModel.getProperty("/allQuestions"),
				existingVendor = detailModel.getProperty("/existingVendor"),
				editBankDetails = detailModel.getProperty("/editBankDetails"),
				questions = detailModel.getProperty("/questions");

			allQuestions = allQuestions.filter(function (o) {
					return (!existingVendor && o.newRequest) ||
						(editBankDetails && o.bankChange) ||
						(existingVendor && o.otherChange);
				})
				.map(function (o) {
					return Object.assign({
						complete: false,
						visible: o.status && !o.parentQuestion
					}, o);
				})
				.forEach(function (o) {
					if (!questions.find(function (q) {
							return q.questionId === o.questionId;
						})) {
						questions.push(o);
					}
				});
			questions.sort(function (q1, q2) {
				return q1.questionId < q2.questionId ? -1 : 1;
			});

			detailModel.setProperty("/questions", questions);
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
					if (data.results.length === 0) {
						return;
					}

					var vendors = "";

					data.results.forEach(function (d) {
						if (!vendors) {
							vendors = d.id;
						} else {
							vendors = vendors + ", " + d.id;
						}
					});

					source.setValueState(ValueState.Warning);
					source.setValueStateText(vendors.indexOf(",") > 0 ? "Multiple Vendors (" + vendors + ") already exist with this ABN" :
						"A Vendor (" + vendors + ") already exists with this ABN");
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
					if (data.results.length === 0) {
						return;
					}

					var vendors = "";

					data.results.forEach(function (d) {
						if (!vendors) {
							vendors = d.id;
						} else {
							vendors = vendors + ", " + d.id;
						}
					});

					source.setValueState(ValueState.Warning);
					source.setValueStateText(vendors.indexOf(",") > 0 ? "Multiple Vendors (" + vendors + ") already exist with this name" :
						"A Vendor (" + vendors + ") already exists with this name");
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
		},

		_checkApproverRequired: function () {
			var model = this.getModel(),
				that = this;

			return new Promise(function (res, rej) {
				model.read(that._sObjectPath + "/ToApprovals", {
					success: function (data) {
						data.results.some(function (a) {
							return a.userSelected;
						}) ? res() : rej();
					}
				});
			});
		},

		_checkBankVerifyRequired: function () {
			var that = this;
			// If bank details are entered, raise the verify dialog
			return new Promise(function (res, rej) {
				if (that.getModel("detailView").getProperty("/editBankDetails") && !that.getModel().getProperty("/bankVerifiedWith")) {
					res();
				} else {
					rej();
				}
			});
		},

		_openApproverDialog: function () {
			if (!this._oApproverDialog) {
				this._oApproverDialog = sap.ui.xmlfragment("req.vendor.codan.fragments.ApproverListDialog", this);
				this.getView().addDependent(this._oApproverDialog);
			}

			var approvalList = sap.ui.getCore().byId("approvalWorkflowList"),
				model = this.getModel(),
				approver = model.getProperty(this._sObjectPath + "/businessUnitApprover"),
				approverName = model.getProperty(this._sObjectPath + "/businessUnitApproverName"),
				that = this;

			if (approvalList) {
				approvalList.getItems().forEach(function (i) {
					var context = i.getBindingContext();

					if (context.getObject().userSelected) {
						model.setProperty(context.getPath() + "/approver", approver);
						model.setProperty(context.getPath() + "/approverName", approverName);
					}
				});
			}

			this._oApproverDialog.open();
		},

		approversCancel: function (event, bSilent) {
			if (this._oApproverDialog) {
				this._oApproverDialog.close();
			}

			this.getModel().resetChanges();

			if (!bSilent) {
				MessageToast.show("Submission Cancelled", {
					duration: 5000
				});
			}
		},

		approversOk: function (event) {
			var that = this;
			if (this._oApproverDialog) {
				this._oApproverDialog.close();
			}

			var verifyPromise = that._checkBankVerifyRequired();

			verifyPromise.then(function () {
				// If bank details are entered, raise the verify dialog
				that._showVerifyBankDialog();
			});

			verifyPromise.catch(function () {
				that._saveReq(true);
			});

		},

		openSelectApproverDialog: function (event) {

			this._approverBindingContext = event.getSource().getBindingContext();
			var authLevel = this._approverBindingContext.getObject().authLevel,
				filters = [];

			if (!this._oSelectApproverDialog) {
				this._oSelectApproverDialog = sap.ui.xmlfragment("req.vendor.codan.fragments.ApproverSelect", this);
				this.getView().addDependent(this._oSelectApproverDialog);
			}

			filters.push(new Filter({
				path: "authLevel",
				operator: FilterOperator.EQ,
				value1: authLevel
			}));

			filters.push(new Filter({
				path: "companyCode",
				operator: FilterOperator.EQ,
				value1: this.getModel().getProperty(this._sObjectPath + "/companyCode")
			}));

			sap.ui.getCore().byId("selectApproverDialog").getBinding("items").filter(filters);

			this._oSelectApproverDialog.open();
		},

		deleteRequest: function () {
			MessageBox.confirm(
				"All data will be lost and the request will be cancelled. This action cannot be undone.\n\nDo you wish to continue?", {
					actions: [MessageBox.Action.YES, MessageBox.Action.NO],
					title: "Data Loss Confirmation",
					onClose: function (sAction) {
						if (sAction === MessageBox.Action.YES) {
							this._deleteRequest();
						}
					}.bind(this)
				});
		},

		_deleteRequest: function () {
			var that = this;
			this.getModel().setProperty(this._sObjectPath + "/deleted", true);

			this._saveReq(false).then(function () {
				MessageToast.show("The request has been successfully deleted");
				that.onNavBack();
			});
		},

		_selectApproverConfirmed: function (event) {

			var context = event.getParameter("selectedItem").getBindingContext().getObject(),
				approver = context.userId,
				approverName = context.userName;

			this.getModel().setProperty(this._approverBindingContext.getPath() + "/approver", approver);
			this.getModel().setProperty(this._approverBindingContext.getPath() + "/approverName", approverName);
			this.getModel().setProperty(this._sObjectPath + "/businessUnitApprover", approver);
			this.getModel().setProperty(this._sObjectPath + "/businessUnitApproverName", approverName);

		},

		showExplainText: function (event) {
			this._oQuestionExplainTextPopover.bindElement({
				path: event.getSource().getBindingContext("detailView").getPath(),
				model: "detailView"
			});
			this._oQuestionExplainTextPopover.openBy(event.getSource());
		},

		questionnaireCheckBoxSelectionChange: function (event) {
			this.getModel("detailView").setProperty(event.getSource().getBindingContext("detailView").getPath() + "/yesNo", event.getParameter(
				"selected") ? "X" : " ");
		},

		cancelPaymentTermsDialog: function (event) {
			this.closePaymentTermsDialog();
		},

		companyStructureChange: function (event) {
			var selectedItem = event.getParameter("selectedItem"),
				withholdingCode = selectedItem.getBindingContext().getObject().filterValue2,
				rentRelated = this.getView().byId("rentRelated");

			rentRelated.setEnabled(!!withholdingCode);

			if (!withholdingCode) {
				this.getModel().setProperty(this._sObjectPath + "/rentRelated", false);
			}

		},

		onEmailChange: function (event) {

			if (!formatter.validateEmail(event.getParameter("newValue"))) {
				var valueState = ValueState.Error,
					valueStateText = "Email address is not valid";
			} else {
				valueState = ValueState.None;
			}

			event.getSource().setValueState(valueState);
			event.getSource().setValueStateText(valueStateText);

		},

		checkPhoneNo: function (event) {
			if (!formatter.validatePhone(event.getParameter("newValue"))) {
				var valueState = ValueState.Error,
					valueStateText = "Enter numbers and spaces only";
			} else {
				valueState = ValueState.None;
			}

			event.getSource().setValueState(valueState);
			event.getSource().setValueStateText(valueStateText);
		}
	});
});