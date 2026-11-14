# OCR Test Log

Record the OCR confidence and compare recognized text with the label image. Note swapped digits, missing lines, odd symbols, and merged words. Keep the original image and cropped image results separate.

| Label / setup | Confidence | What went wrong | Fields affected |
| --- | ---: | --- | --- |
| Label 1, original screenshot | 94% | Included the document heading "Label 1: Arial, clean layout" before the label. | Drug name candidate / top-of-label parsing |
| Label 1, cropped | Pending | Pending | Pending |
| Label 2 | Pending | Pending | Pending |
| Label 3 | Pending | Pending | Pending |
| Label 4 | Pending | Pending | Pending |
| Label 5 | Pending | Pending | Pending |
| Label 6 | Pending | Pending | Pending |
| Label 7 | Pending | Pending | Pending |
| Phone photo: room light | Pending | Not tested | Pending |
| Phone photo: slight angle | Pending | Not tested | Pending |
| Phone photo: shadow | Pending | Not tested | Pending |
| Phone photo: wrapped around cup | Pending | Not tested | Pending |

## Validation status

The parser unit tests use generic examples and cover confidence handling, conflicting values, and rejection of Rx numbers, dates, and phone numbers as doses. They do not measure OCR accuracy against the label images. No cropped label 1-7 source images are available in this workspace, so step 1 and the seven-label regression run remain pending.

For optional full Tesseract diagnostics in local development, set `VITE_DEBUG_OCR=true`. This logs the OCR result, which includes recognized text; use mock labels only and leave the flag unset for normal use.

Earlier exploratory output came from one combined screenshot containing labels 7-9. The test-specific label 8 and 9 examples have been removed from the parser suite. Keep labels 8-10 out of rule tuning and reserve them for final accuracy measurement. The current 60% confidence threshold is provisional; calibrate it using the cropped labels 1-7 before relying on it.

The Express `/api/parse-label` route currently returns a clearly marked all-unclear stub response. Bedrock is not connected because model access and team backend ownership are not confirmed. The frontend calls the stub only when at least three core fields are unclear, sends OCR text only, and validates source excerpts and values before accepting any returned field.

Translation uses DeepL through the backend. The frontend sends generated plain-language sentences only, not the image or raw OCR; medication names, strengths, and numbers are masked and restored only if their markers survive. Translated sentence text is sent to DeepL, so this mode is not on-device-only.

Multiple-label grouping is covered by synthetic vertical and horizontal layout tests, but no real multi-label screenshot or phone-photo set is present for OCR validation. The app can separate spatially distinct regions; it cannot guarantee separation when label boxes overlap or touch.