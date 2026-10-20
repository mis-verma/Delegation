UPDATE `ChecklistInstanceImage` im
JOIN `ChecklistInstanceItem` cii ON cii.id = im.checklistInstanceItemId
SET im.purpose = IF(cii.booleanAnswer = 'YES', 'CONDITIONAL_YES', 'CONDITIONAL_NO')
WHERE im.purpose = 'GENERAL'
  AND cii.itemType IN ('YES_NO', 'PASS_FAIL')
  AND cii.requiredImageCount = 0
  AND cii.booleanAnswer IS NOT NULL
  AND JSON_CONTAINS(IF(cii.booleanAnswer = 'YES', cii.yesActions, cii.noActions), '"REQUIRE_PHOTO"');
