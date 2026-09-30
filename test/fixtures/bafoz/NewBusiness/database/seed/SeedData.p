/*------------------------------------------------------------------------
    Program:  SeedData.p
    Purpose:  Populates the campaign and benefit master data used
              throughout manual testing and the automated test suite
              (Section 52 - Mock Data). This is a procedural integration
              boundary by design (Section 2 allows .p files only at
              integration boundaries) - it contains no business logic,
              it only feeds data into the repositories through their
              public, interface-defined methods.

    Usage:
        RUN database/seed/SeedData.p
            (INPUT poCampaignRepository, INPUT poBenefitRepository).
------------------------------------------------------------------------*/

USING domain.interfaces.ICampaignRepository.
USING domain.interfaces.IBenefitRepository.
USING domain.entities.Campaign.
USING domain.entities.Benefit.

DEFINE INPUT PARAMETER poCampaignRepository AS ICampaignRepository NO-UNDO.
DEFINE INPUT PARAMETER poBenefitRepository  AS IBenefitRepository  NO-UNDO.

DEFINE VARIABLE oCampaign AS Campaign NO-UNDO.
DEFINE VARIABLE oBenefit  AS Benefit  NO-UNDO.

/* ---- Campaigns (Section 52) ------------------------------------- */

oCampaign = NEW Campaign().
oCampaign:Create("CAM001", "CAM001", "January New Business", 01/01/2026, 01/31/2026, Campaign:STATUS_ACTIVE, "seed").
poCampaignRepository:Save(oCampaign).

oCampaign = NEW Campaign().
oCampaign:Create("CAM002", "CAM002", "Digital Campaign", 01/01/2026, 12/31/2026, Campaign:STATUS_ACTIVE, "seed").
poCampaignRepository:Save(oCampaign).

oCampaign = NEW Campaign().
oCampaign:Create("CAM003", "CAM003", "Summer Campaign", 12/01/2025, 02/28/2026, Campaign:STATUS_ACTIVE, "seed").
poCampaignRepository:Save(oCampaign).

oCampaign = NEW Campaign().
oCampaign:Create("CAM004", "CAM004", "Expired Campaign", 01/01/2025, 12/31/2025, Campaign:STATUS_EXPIRED, "seed").
poCampaignRepository:Save(oCampaign).

/* ---- Benefits (Section 52) ----------------------------------------
   CoverAmount (database/delta 002) is the catalogue-level default sum
   assured for each benefit. */

oBenefit = NEW Benefit().
oBenefit:Create("BEN001", "LIFE", "Life Cover", "Life insurance benefit", 250, Benefit:STATUS_ACTIVE, "seed").
oBenefit:SetCoverAmount(500000).
poBenefitRepository:Save(oBenefit).

oBenefit = NEW Benefit().
oBenefit:Create("BEN002", "FUNERAL", "Funeral Cover", "Funeral insurance benefit", 150, Benefit:STATUS_ACTIVE, "seed").
oBenefit:SetCoverAmount(50000).
poBenefitRepository:Save(oBenefit).

oBenefit = NEW Benefit().
oBenefit:Create("BEN003", "ACCIDENT", "Accident Cover", "Personal accident benefit", 100, Benefit:STATUS_ACTIVE, "seed").
oBenefit:SetCoverAmount(250000).
poBenefitRepository:Save(oBenefit).

oBenefit = NEW Benefit().
oBenefit:Create("BEN004", "DISABILITY", "Disability Cover", "Disability income benefit", 300, Benefit:STATUS_ACTIVE, "seed").
oBenefit:SetCoverAmount(1000000).
poBenefitRepository:Save(oBenefit).

oBenefit = NEW Benefit().
oBenefit:Create("BEN005", "HOSPITAL", "Hospital Cash Plan", "Hospital cash benefit", 200, Benefit:STATUS_ACTIVE, "seed").
oBenefit:SetCoverAmount(100000).
poBenefitRepository:Save(oBenefit).

RETURN.
