-- Custom SQL migration file, put your code below! --
-- Daily checklists stop running on Sundays (owner's request). Admins can turn Sunday back on per
-- checklist in the builder's Schedule step.
UPDATE `ChecklistDefinition` SET `activeWeekdays` = JSON_ARRAY(1, 2, 3, 4, 5, 6) WHERE `recurrence` = 'DAILY' AND `activeWeekdays` IS NULL;
