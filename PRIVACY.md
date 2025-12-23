# Privacy Policy for Keka Attendance Quick

**Last Updated:** December 23, 2025

## Overview

Keka Attendance Quick is a Chrome extension that helps you track your work hours and set reminders. We are committed to protecting your privacy.

## Data Collection

**We do NOT collect, store, or transmit any personal data to external servers.**

All data is stored locally on your device using Chrome's built-in storage APIs.

## Data Stored Locally

The extension stores the following data **locally on your device only**:

| Data                 | Purpose                            |
| -------------------- | ---------------------------------- |
| Company subdomain    | To connect to your Keka instance   |
| Theme preference     | Light/dark mode setting            |
| Reminder settings    | Custom reminder times and messages |
| Last fetch timestamp | To schedule accurate reminders     |

## Permissions Used

| Permission      | Why It's Needed                                                 |
| --------------- | --------------------------------------------------------------- |
| `storage`       | Save your settings locally and sync across your Chrome browsers |
| `alarms`        | Schedule hourly refreshes and reminder notifications            |
| `notifications` | Display reminder alerts before clock-out time                   |
| `tabs`          | Access your open Keka tab to fetch attendance data              |
| `scripting`     | Extract authentication token from Keka page                     |

## Third-Party Services

- This extension connects **only** to your company's Keka instance (`yourcompany.keka.com`)
- No data is sent to any other third-party services
- No analytics or tracking is implemented

## Data Security

- All authentication happens directly between your browser and Keka's servers
- No tokens or credentials are stored persistently
- Settings sync uses Chrome's encrypted sync storage

## Your Rights

You can:

- Clear all extension data via Chrome settings
- Uninstall the extension to remove all local data
- Modify or delete your reminders at any time

## Contact

If you have questions about this privacy policy, please open an issue on our GitHub repository.

## Changes to This Policy

We may update this policy occasionally. Changes will be reflected in the "Last Updated" date above.

---

_This extension is not affiliated with or endorsed by Keka HR._
