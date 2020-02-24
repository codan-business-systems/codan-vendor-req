sap.ui.define([
	"sap/ui/core/ValueState"
	], function (ValueState) {
		"use strict";

		return {
			
			yesNoResponseRequired: function(sResponseType) {
				return sResponseType.indexOf("YN") > -1;
			},
			
			questionMandatory: function(sStatus) {
				return sStatus === "M";	
			},
			
			responseTextVisible: function(sResponseType) {
				return sResponseType.indexOf("T") > -1;	
			},
			
			responseTextEnabled: function(sResponseType, sYesNo) {
				return sResponseType === "TXT" || sResponseType.indexOf("T") > -1 && sYesNo === "X";
			},
			
			yesNoSelectedIndex: function(sYesNo) {
				if (!sYesNo) {
					return -1;
				}
				return sYesNo === "X" ? 1 : 0;
			},
			
			formatApproverName: function(sApproverName, bUserSelected) {
				if (!bUserSelected) {
					return "No selection required";	
				}
				
				if (!sApproverName) {
					return "Not Selected";
				}
				
				return sApproverName;
			},
			
			formatApproverInfoState: function(sApproverName, bUserSelected) {
				if (!bUserSelected || sApproverName) {
					return ValueState.Success;	
				}
				
				return ValueState.Error;
			},
			
			formatApproverInfo: function(sApproverName, bUserSelected) {
				if (!bUserSelected || sApproverName) {
					return "OK";
				}
				
				return "Select an Approver";
			},
		};

	}
);