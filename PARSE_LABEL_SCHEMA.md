# Parse Label Result Shape

Share this object shape with the Visit Packet teammate. Every medication is one object with the complete original OCR text and field results. Each field uses `value`, `originalText`, and `status`; uncertain or unmatched fields use `value: null` and `status: "unclear"`.

```json
{
  "originalText": "MONTELUKAST 10 MG TABLET\nTake 1 tablet in the evening.\nQty: 30 Refills: 4",
  "drugName": {
    "value": "MONTELUKAST",
    "originalText": "MONTELUKAST 10 MG TABLET",
    "status": "found"
  },
  "dose": {
    "value": "10 MG",
    "originalText": "10 MG",
    "status": "found"
  },
  "directions": {
    "value": "Take 1 tablet in the evening.",
    "originalText": "Take 1 tablet in the evening.",
    "status": "found"
  },
  "frequency": {
    "value": null,
    "originalText": "",
    "status": "unclear"
  },
  "route": {
    "value": null,
    "originalText": "",
    "status": "unclear"
  },
  "quantity": {
    "value": "30",
    "originalText": "Qty: 30",
    "status": "found"
  },
  "refills": {
    "value": "4",
    "originalText": "Refills: 4",
    "status": "found"
  },
  "warnings": {
    "value": null,
    "originalText": "",
    "status": "unclear"
  }
}
```

`route` and `directions` are included so abbreviations such as `PO` can be represented accurately without treating them as frequencies. An unclear warning field does not mean that the label has no warnings; the label must be checked.
