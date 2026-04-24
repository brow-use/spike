# Needs
1. Create automated test infrastructure for web applications like we create software code
2. Fetch data from a website using natural language, including when authentication is required & not providing login details to the model
3. Perform some action on a website using natural language, including when authentication is required & not providing login details to the model

# Additional Requirements
1. Be able to do 2 & 3 from the browser extension
2. Explore and generate page objects

# Features Completed
- Generate & update page objects (need 1)
- Explore website and document in md files (need 2, 3)
- Peform action using documentation created via explore and document process (need 2, 3)

# TODO
- (maybe) support automation for interconnections as well
- Record page objects during exploration
- Addl Requirements: 1
- Tell record page objects to not try to return next page object from it

# Key Commands
### Level 1
- self-explore (The model/agent explores the web application on its own, records everything, and saves it)
- run-instruction (The model/agent runs the user's intention in the browser, records everything, and saves it)

### Level 2
- document (Creates a documentation from the exploration data for human verification and any other AI usage e.g. do in step 3)
- generate-page-objects (Generates page objects from the exploration and run data)

### Level 3
- do (Depends on the documentation, and falls back to exploration data if documentation is not sufficient, and executes user provided instructions)