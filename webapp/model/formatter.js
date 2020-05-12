sap.ui.define([
	"sap/ui/core/ValueState"
], function (ValueState) {
	"use strict";

	return {

		yesNoResponseRequired: function (sResponseType) {
			return sResponseType.indexOf("Y") > -1 && sResponseType.indexOf("N") > -1;
		},

		questionMandatory: function (sStatus) {
			return sStatus === "M";
		},

		responseTextVisible: function (sResponseType) {
			return sResponseType.indexOf("T") > -1;
		},

		responseTextEnabled: function (sResponseType, sYesNo) {
			switch (sResponseType) {
			case "TXT":
				return true;
			case "YNT":
				return sYesNo === "X";
			case "NYT":
				return sYesNo === "-";
			default:
				return false;
			}
		},

		yesNoSelectedIndex: function (sYesNo) {
			if (!sYesNo) {
				return -1;
			}
			return sYesNo === "X" ? 1 : 0;
		},

		checkBoxSelected: function (sYesNo) {
			return sYesNo === "X";
		},

		formatApproverName: function (sApproverName, bUserSelected) {
			if (!bUserSelected) {
				return "No selection required";
			}

			if (!sApproverName) {
				return "Not Selected";
			}

			return sApproverName;
		},

		formatApproverInfoState: function (sApproverName, bUserSelected) {
			if (!bUserSelected || sApproverName) {
				return ValueState.Success;
			}

			return ValueState.Error;
		},

		formatApproverInfo: function (sApproverName, bUserSelected) {
			if (!bUserSelected || sApproverName) {
				return "OK";
			}

			return "Select an Approver";
		},

		formatFileSize: function (sFileSize) {
			return parseFloat(sFileSize);
		},

		/**
		 * Validates that the email address is of the correct format
		 * @param {String} email: email address to verify
		 * @returns {Boolean} true if email is valid
		 * @public
		 */
		validateEmail: function (email) {
			var emailRegex = /^\w+[\w-+\.]*\@\w+([-\.]\w+)*\.[a-zA-Z]{2,}$/;

			if (!email) {
				return true;
			}

			return email.match(emailRegex);
		},
		
		validatePhone: function(phone) {
			var phoneRegex = /[^\d\s]/g;
			
			if (!phone) {
				return true;
			}
			
			return !phone.match(phoneRegex);
		}
	};

});