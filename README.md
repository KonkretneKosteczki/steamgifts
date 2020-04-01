Enter giveaways on https://steamgifts.com provided php session id token (can be obtained from cookies)

Enters giveaways in order of priority:
+ steam wishlist
+ recommended
+ rest

Giveaways with bad user steam reviews (based on Evan Miller's algorithm), no reviews (that includes pre-orders) or removed from the steam store are excluded from the entries, for the recommended and standard search. The wishlist ignores reviews when using basic settings, as your preferences may differ from community's.

Giveaways of game bundles are always entered, as you cannot review a bundle - subject to change in case of all games reviews queries implementation (possibly if any game in a bundle satisfies condition enter the giveaway anyway)

Pinned giveaways are checked against the review filter and potentially entered only during the first run (wishlist run). For the giveaways on users wishlist lower review boundary is ignored.

Giveaways are entered every 15 minutes + time of the last run
