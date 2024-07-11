# Junction Relay

http://junctionrelay.com

**Current Alpha:** Junction Relay v0.3.7-Alpha

- Windows Defender false positives are possible/likely, presumably due to sensor reading and not being submitted for verification yet.
- Even if false positive doesn't occur, it's likely you'll need to unblock the DLLs contained in the folders DataSources, DataSourceTargetCombos and DataTargets.

**Known bugs:**

- Data Sources and Targets can detect connection failures, but do not automatically close/stop the connection or junction currently. They will retry the connection until the retry limit is hit.
- Changes made to a junction persist throughout the application, even if you don't hit the 'Save' button - closing the app/reloading will restore the true saved settings. Todo is to implement 'your changes will be lost' if you don't save event, and clear the unsaved changes. Best practice - always save your changes to commit them.
- You cannot refresh sensor data from within a junction right now.
- You cannot edit the formula for a brand new formula field. You need to save/close/reopen the junction first.
- Payload preview doesn't load for brand new junctions. You need to save/close/reopen the junction first. It will not display content when 'show length' is false, but it will work.
- It's possible to cause duplicate records on the mainoverview UI. Click path unknown.
- Resetting sensor tag will sometimes reset the wrong sensor.

**Testing Tools**

**TestServer** has 3 python scritps (and a .bat that launches all 3) which simulate HTTP services that broadcast fake sensors over ports 5001, 5002 and 5003. To connect to them in JunctionRelay, add the 'Generic HTTP Server' data source and enter a URL of http://localhost:5001/data.json (change the port as needed). You do not need to populate any of the other fields.

Likewise, **TestClient** has 2 python scripts (and a .bat that launches both) that simulate HTTP services that receive the data from JunctionRelay, over ports 5000 and 5005. Add 'Generic HTTP Client' as the data target and enter URL of http://localhost:5000/data.json (change port as needed)

To download the latest release of JunctionRelay (alpha), click the **Releases** on the right hand panel.
