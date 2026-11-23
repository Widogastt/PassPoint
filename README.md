# PassPoint

PassPoint is an English-language classroom hall pass board with an original interface. It starts with a fictional roster. In Settings, clear the sample data or replace the roster with one name per line.

Select a student to issue a free pass or add them to the waiting line. Select an active student or use **Return** to check their pass back in. When a pass is free, use **Send** to advance the line. **Class stats** shows trips by week and student.

Each browser stores its own classes and trips. Reloading keeps the board. Completed history is retained for 90 days, and passes still out when the date changes are marked as having no return recorded. The app uses the device's date and time.

## Run locally

Run `python -m http.server 8000 --directory dist` from this directory, then open `http://localhost:8000`. The app has no build step.

## Reference

The public [Flint Hall Pass](https://flintk12.com/hallpass) page was used as a functional reference. The shipped public JavaScript was inspected using [Reverse Engineer Anything](https://github.com/teonett/Reverse-Engineer-Anything) version 4.1.0.
