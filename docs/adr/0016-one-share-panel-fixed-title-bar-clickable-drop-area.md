# ADR 0016: One place to share, a title bar that stays, and a drop area that can be clicked

- Status: Accepted
- Date: 2026-09-20
- Amends: [ADR 0010](0010-input-queue.md) (which gave the results screen controls of its own for serving the saved books)

## Context

Hands-on testing of the queue window found three rough edges.

- **Two ways to share, that looked like two features.** A Share button at the top opened a full panel (any library, a network, authentication), and after a run the results screen carried a "Send to KOReader" card with its own start and stop. They served the same catalog from the same state but looked and read differently, and the window showed two buttons that both said share. Sharing on its own, without running anything first, is worth keeping, as mangabind and mangapress are usable on their own, so the answer is not to drop one of them.
- **A title bar that scrolled away.** The window is drawn without its own frame, and the operating system draws its buttons (minimize, maximize, close) over the top right corner. The bar was part of the page, so on a long page it scrolled out of sight while the window's buttons stayed put over the content.
- **A drop area that ignored clicks.** The empty queue's dashed area said to drop things on it, and clicking it did nothing. Choosing from the file manager meant finding the two buttons above it.

## Decision

- **One Share panel, and one place it is opened from: the title bar.** The Share button sits in the bar and reads "Sharing" while the catalog is served, so the state is known without opening anything. The panel opens under it as a dialog that does not block the page: focus moves into it, Escape closes it and gives focus back to where it came from, and a click anywhere else closes it without moving focus. Choosing the library, the network, the authentication, starting and stopping, and the address with its copy button and the KOReader steps are all in that one panel.
- **The results screen keeps its "Send to KOReader" card as a way in, with no controls of its own.** "Share these books" opens the same panel with the folder just saved to already chosen. If something else is already being shared it does not change that: the card says "Sharing" and "Show sharing" opens the panel where Stop sharing is.
- **The title bar is fixed.** The window is a bar and, under it, the part that scrolls. The bar carries the app name and the Share button in the space the window's own buttons leave free; on macOS, where those buttons are on the left, the name starts further in. What is on the bar is clicked, and only its empty part drags the window.
- **The empty drop area is clickable.** A click anywhere in it asks whether to add files or a folder, because a native dialog on Windows and Linux cannot pick both in one go. The words in it are a button, so the keyboard has the same way in, and Escape puts the question away. Once the queue has items, only the line under them opens the question.

## Consequences

Sharing is set up in one place, whichever way it is reached, and the two entry points cannot disagree because they show one state. The panel opens over the page rather than pushing it down, so the queue does not jump.

Known limits: the room left for the window's buttons on macOS is a fixed width, not measured from the real ones, which the release checks (M8) look at; and the panel stays open until it is closed or something else is clicked, so it can be left open while working.
