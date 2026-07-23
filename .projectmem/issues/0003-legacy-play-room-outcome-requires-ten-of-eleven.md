# #0003 Legacy /play room outcome requires ten of eleven votes, contradicting its authored 8-3 return, and can describe mixed tallies as one mind

- 2026-07-23T11:19:24Z `issue`: Legacy /play room outcome requires ten of eleven votes, contradicting its authored 8-3 return, and can describe mixed tallies as one mind [site/public/play/play.js]
- 2026-07-23T11:20:08Z `attempt`: Replaced the 10-vote threshold with a strict majority of all eleven room positions and made verdict copy account for dissent and undecided votes [site/public/play/play.js] (partial)
- 2026-07-23T11:21:01Z `attempt`: JavaScript syntax, authored 8-3 return, mixed-undecided, deadlock, unanimity assertions, and 4 Worker tests all passed [site/public/play/play.js] (worked)
- 2026-07-23T11:21:01Z `fix`: Legacy /play now returns its authored majority verdict and never labels divided or undecided tallies as one mind [site/public/play/play.js]
