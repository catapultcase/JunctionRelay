# JunctionRelay

**TestSender** has 3 python scritps (and a .bat that launches all 3) which simulate HTTP services that broadcast fake sensors over ports 5001, 5002 and 5003. To connect to them in JunctionRelay, add the 'Generic HTTP Client' data source and enter a URL of http://localhost:5001/data.json (change the port as needed). You do not need to populate any of the other fields.

Likewise, **TestClient** has 2 python scripts (and a .bat that launches both) that simulate HTTP services that receive the data from JunctionRelay, over ports 5000 and 5005. Add 'Generic HTTP Sender' as the data target and enter URL of http://localhost:5000/data.json (change port as needed)

To download the latest release of JunctionRelay (alpha), click the **Releases** on the right hand panel.
