sap.ui.define([
	], function () {
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
			}
		};

	}
);