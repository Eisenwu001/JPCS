// js/notifications.js
// Handles formatting and sending task assignment and deadline reminders via Gmail API.

import { sendGmailNotification, isConnected } from "./sheets-sync.js";

// Helper to determine if an email is valid
export function isValidEmail(email) {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

// Map styles for display in emails
function getPriorityLabel(priority) {
  const p = (priority || "").toLowerCase();
  if (p === "high") return "High";
  if (p === "low") return "Low";
  return "Medium";
}

function getStatusLabel(status) {
  const s = (status || "").toLowerCase();
  if (s === "todo") return "To Do";
  if (s === "in_progress" || s === "in-progress") return "In Progress";
  if (s === "review") return "Review";
  if (s === "done") return "Done";
  return s;
}

function getStatusBadgeStyle(status) {
  const s = (status || "").toLowerCase();
  if (s === "todo") {
    return { bg: "#fdf5ec", color: "#825329", icon: "⏳" };
  }
  if (s === "in_progress" || s === "in-progress") {
    return { bg: "#eff6ff", color: "#1d4ed8", icon: "⚡" };
  }
  if (s === "review") {
    return { bg: "#faf5ff", color: "#7e22ce", icon: "👀" };
  }
  if (s === "done") {
    return { bg: "#f0fdf4", color: "#15803d", icon: "✅" };
  }
  return { bg: "#f4f4f5", color: "#52525b", icon: "📌" };
}

function formatFriendlyDate(dateStr) {
  if (!dateStr) return "No date set";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  } catch (e) {
    return dateStr;
  }
}

function getInitials(name) {
  if (!name) return "??";
  const parts = name.trim().split(/[\s,]+/);
  const filtered = parts.filter(p => p.length > 0 && !p.includes("."));
  if (filtered.length >= 2) {
    return (filtered[0][0] + filtered[1][0]).toUpperCase();
  } else if (filtered.length === 1) {
    return filtered[0].substring(0, 2).toUpperCase();
  }
  return "??";
}

/** Formats and sends a Task Assignment email matching the requested classic UI design */
export async function sendTaskAssignmentEmail(task, member) {
  if (!isConnected()) {
    console.warn("Gmail not connected. Skipping email dispatch.");
    return false;
  }

  const emailAddress = (member.contact || "").trim();
  if (!isValidEmail(emailAddress)) {
    throw new Error(`Assignee "${member.name}" does not have a valid email address in their Contact field ("${member.contact || 'empty'}").`);
  }

  const taskTitle = task.title || "Untitled Task";
  const taskDesc = task.description || "No description provided.";
  const statusText = getStatusLabel(task.status);
  const priorityText = getPriorityLabel(task.priority);
  const category = (task.category || "General").toUpperCase();
  const dateRange = task.startDate && task.endDate
    ? `${task.startDate} to ${task.endDate}`
    : (task.startDate ? `Starts: ${task.startDate}` : (task.endDate ? `Ends: ${task.endDate}` : "No dates set"));

  // Pure HTML-safe dots for beautiful visual accents
  const statusColor = task.status === "done" ? "#16a34a" : (task.status === "todo" ? "#d97706" : "#2563eb");
  const priorityColor = task.priority === "high" ? "#dc2626" : (task.priority === "low" ? "#2563eb" : "#ea580c");

  const appUrl = "https://jpcstreasury.vercel.app";
  const subject = `New Task Assigned: ${taskTitle}`;

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #faf8f6; padding: 40px 20px; color: #2c2421; line-height: 1.6;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #eadecf; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #e88d48 0%, #cc8039 100%); padding: 36px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px;">New Task Assigned</h1>
          <p style="color: rgba(255, 255, 255, 0.9); margin: 6px 0 0; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Task Assignment Notification</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 32px 24px;">
          <h2 style="margin-top: 0; font-size: 20px; font-weight: 600; color: #1e1512;">Hi ${member.name},</h2>
          <p style="font-size: 15px; color: #54443f; margin-bottom: 24px; line-height: 1.5;">
            You have been assigned to a new task on the JPCS dashboard. Here are the details of your assignment:
          </p>
          
          <!-- Task Card -->
          <div style="background: #fdfbf7; border: 1px solid #f3ebe1; border-radius: 8px; padding: 24px; margin-bottom: 28px;">
            <div style="font-size: 12px; font-weight: 700; color: #cc8039; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">${category} TASK</div>
            <h3 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #1e1512; line-height: 1.3;">${taskTitle}</h3>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
              <tr>
                <td style="padding: 8px 0; font-size: 13.5px; color: #806c66; width: 100px; font-weight: 500;">Status:</td>
                <td style="padding: 8px 0; font-size: 14.5px; font-weight: 600; color: #2c2421;">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${statusColor}; margin-right: 8px; vertical-align: middle;"></span>
                  <span style="vertical-align: middle;">${statusText}</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-size: 13.5px; color: #806c66; font-weight: 500;">Priority:</td>
                <td style="padding: 8px 0; font-size: 14.5px; font-weight: 600; color: #2c2421;">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${priorityColor}; margin-right: 8px; vertical-align: middle;"></span>
                  <span style="vertical-align: middle;">${priorityText}</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-size: 13.5px; color: #806c66; font-weight: 500;">Timeline:</td>
                <td style="padding: 8px 0; font-size: 14.5px; font-weight: 600; color: #2c2421;">
                  <span style="vertical-align: middle;">${dateRange}</span>
                </td>
              </tr>
            </table>
            
            <div style="border-top: 1px solid #f3ebe1; padding-top: 16px; margin-top: 16px;">
              <div style="font-size: 11px; font-weight: 700; color: #806c66; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Description</div>
              <p style="margin: 0; font-size: 14px; color: #54443f; font-style: italic; line-height: 1.5;">${taskDesc}</p>
            </div>
          </div>
          
          <!-- Action Button -->
          <div style="text-align: center; margin-bottom: 12px;">
            <a href="${appUrl}" style="display: inline-block; background-color: #cc8039; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 12px 32px; border-radius: 6px; box-shadow: 0 4px 6px rgba(204, 128, 57, 0.15); transition: background-color 0.15s ease;">
              View Task Dashboard
            </a>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #fcfaf8; padding: 24px; border-top: 1px solid #eadecf; text-align: center; font-size: 12.5px; color: #806c66; line-height: 1.5;">
          <p style="margin: 0 0 4px;">Sent automatically from the JPCS Treasury Portal.</p>
          <p style="margin: 0;">&copy; 2026 Junior Philippine Computer Society. All rights reserved.</p>
        </div>
      </div>
    </div>
  `;

  await sendGmailNotification(emailAddress, subject, htmlBody);
  return true;
}

/** Formats and sends a Task Deadline Reminder email matching the requested classic UI design with red accents */
export async function sendTaskDeadlineEmail(task, member) {
  if (!isConnected()) {
    console.warn("Gmail not connected. Skipping email dispatch.");
    return false;
  }

  const emailAddress = (member.contact || "").trim();
  if (!isValidEmail(emailAddress)) {
    throw new Error(`Assignee "${member.name}" does not have a valid email address in their Contact field ("${member.contact || 'empty'}").`);
  }

  const taskTitle = task.title || "Untitled Task";
  const taskDesc = task.description || "No description provided.";
  const statusText = getStatusLabel(task.status);
  const priorityText = getPriorityLabel(task.priority);
  const category = (task.category || "General").toUpperCase();
  const dateRange = task.startDate && task.endDate
    ? `${task.startDate} to ${task.endDate}`
    : (task.startDate ? `Starts: ${task.startDate}` : (task.endDate ? `Ends: ${task.endDate}` : "No dates set"));

  // Pure HTML-safe dots for beautiful visual accents
  const statusColor = task.status === "done" ? "#16a34a" : (task.status === "todo" ? "#d97706" : "#2563eb");
  const priorityColor = task.priority === "high" ? "#dc2626" : (task.priority === "low" ? "#2563eb" : "#ea580c");

  const appUrl = "https://jpcstreasury.vercel.app";
  const subject = `Deadline Reminder: ${taskTitle}`;

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #faf8f6; padding: 40px 20px; color: #2c2421; line-height: 1.6;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #eadecf; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
        <!-- Header (Red accents for urgent reminders) -->
        <div style="background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); padding: 36px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px;">Deadline Approaching</h1>
          <p style="color: rgba(255, 255, 255, 0.9); margin: 6px 0 0; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Task Deadline Reminder</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 32px 24px;">
          <h2 style="margin-top: 0; font-size: 20px; font-weight: 600; color: #1e1512;">Hi ${member.name},</h2>
          <p style="font-size: 15px; color: #54443f; margin-bottom: 24px; line-height: 1.5;">
            This is a friendly reminder that the deadline is approaching for your assigned task. Please review the details below:
          </p>
          
          <!-- Task Card -->
          <div style="background: #fdfafb; border: 1px solid #f9ebed; border-radius: 8px; padding: 24px; margin-bottom: 28px;">
            <div style="font-size: 12px; font-weight: 700; color: #b91c1c; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">${category} TASK - URGENT</div>
            <h3 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #1e1512; line-height: 1.3;">${taskTitle}</h3>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
              <tr>
                <td style="padding: 8px 0; font-size: 13.5px; color: #806c66; width: 100px; font-weight: 500;">Status:</td>
                <td style="padding: 8px 0; font-size: 14.5px; font-weight: 600; color: #2c2421;">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${statusColor}; margin-right: 8px; vertical-align: middle;"></span>
                  <span style="vertical-align: middle;">${statusText}</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-size: 13.5px; color: #806c66; font-weight: 500;">Priority:</td>
                <td style="padding: 8px 0; font-size: 14.5px; font-weight: 600; color: #b91c1c;">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${priorityColor}; margin-right: 8px; vertical-align: middle;"></span>
                  <span style="vertical-align: middle;">${priorityText} (Urgent Reminder)</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-size: 13.5px; color: #806c66; font-weight: 500;">Timeline:</td>
                <td style="padding: 8px 0; font-size: 14.5px; font-weight: 700; color: #b91c1c;">
                  <span style="vertical-align: middle;">${dateRange}</span>
                </td>
              </tr>
            </table>
            
            <div style="border-top: 1px solid #f9ebed; padding-top: 16px; margin-top: 16px;">
              <div style="font-size: 11px; font-weight: 700; color: #806c66; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Description</div>
              <p style="margin: 0; font-size: 14px; color: #54443f; font-style: italic; line-height: 1.5;">${taskDesc}</p>
            </div>
          </div>
          
          <!-- Action Button -->
          <div style="text-align: center; margin-bottom: 12px;">
            <a href="${appUrl}" style="display: inline-block; background-color: #b91c1c; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 12px 32px; border-radius: 6px; box-shadow: 0 4px 6px rgba(185, 28, 28, 0.15); transition: background-color 0.15s ease;">
              Update Task Status
            </a>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #fcfaf8; padding: 24px; border-top: 1px solid #eadecf; text-align: center; font-size: 12.5px; color: #806c66; line-height: 1.5;">
          <p style="margin: 0 0 4px;">Sent automatically from the JPCS Treasury Portal.</p>
          <p style="margin: 0;">&copy; 2026 Junior Philippine Computer Society. All rights reserved.</p>
        </div>
      </div>
    </div>
  `;

  await sendGmailNotification(emailAddress, subject, htmlBody);
  return true;
}

/** Formats and sends a Task Updated email when a task's details are modified */
export async function sendTaskUpdatedEmail(task, member) {
  if (!isConnected()) {
    console.warn("Gmail not connected. Skipping email dispatch.");
    return false;
  }

  const emailAddress = (member.contact || "").trim();
  if (!isValidEmail(emailAddress)) {
    throw new Error(`Assignee "${member.name}" does not have a valid email address in their Contact field ("${member.contact || 'empty'}").`);
  }

  const taskTitle = task.title || "Untitled Task";
  const taskDesc = task.description || "No description provided.";
  const statusText = getStatusLabel(task.status);
  const priorityText = getPriorityLabel(task.priority);
  const category = (task.category || "General").toUpperCase();
  const dateRange = task.startDate && task.endDate
    ? `${task.startDate} to ${task.endDate}`
    : (task.startDate ? `Starts: ${task.startDate}` : (task.endDate ? `Ends: ${task.endDate}` : "No dates set"));

  const statusColor = task.status === "done" ? "#16a34a" : (task.status === "todo" ? "#d97706" : "#2563eb");
  const priorityColor = task.priority === "high" ? "#dc2626" : (task.priority === "low" ? "#2563eb" : "#ea580c");

  const appUrl = "https://jpcstreasury.vercel.app";
  const subject = `Task Updated: ${taskTitle}`;

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #faf8f6; padding: 40px 20px; color: #2c2421; line-height: 1.6;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #eadecf; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); padding: 36px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px;">Task Details Updated</h1>
          <p style="color: rgba(255, 255, 255, 0.9); margin: 6px 0 0; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Task Update Notification</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 32px 24px;">
          <h2 style="margin-top: 0; font-size: 20px; font-weight: 600; color: #1e1512;">Hi ${member.name},</h2>
          <p style="font-size: 15px; color: #54443f; margin-bottom: 24px; line-height: 1.5;">
            An assigned task's details have been updated on the JPCS dashboard. Here are the updated details:
          </p>
          
          <!-- Task Card -->
          <div style="background: #fdfbf7; border: 1px solid #f3ebe1; border-radius: 8px; padding: 24px; margin-bottom: 28px;">
            <div style="font-size: 12px; font-weight: 700; color: #1e3a8a; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">${category} TASK</div>
            <h3 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #1e1512; line-height: 1.3;">${taskTitle}</h3>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
              <tr>
                <td style="padding: 8px 0; font-size: 13.5px; color: #806c66; width: 100px; font-weight: 500;">Status:</td>
                <td style="padding: 8px 0; font-size: 14.5px; font-weight: 600; color: #2c2421;">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${statusColor}; margin-right: 8px; vertical-align: middle;"></span>
                  <span style="vertical-align: middle;">${statusText}</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-size: 13.5px; color: #806c66; font-weight: 500;">Priority:</td>
                <td style="padding: 8px 0; font-size: 14.5px; font-weight: 600; color: #2c2421;">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${priorityColor}; margin-right: 8px; vertical-align: middle;"></span>
                  <span style="vertical-align: middle;">${priorityText}</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-size: 13.5px; color: #806c66; font-weight: 500;">Timeline:</td>
                <td style="padding: 8px 0; font-size: 14.5px; font-weight: 600; color: #2c2421;">
                  <span style="vertical-align: middle;">${dateRange}</span>
                </td>
              </tr>
            </table>
            
            <div style="border-top: 1px solid #f3ebe1; padding-top: 16px; margin-top: 16px;">
              <div style="font-size: 11px; font-weight: 700; color: #806c66; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Description</div>
              <p style="margin: 0; font-size: 14px; color: #54443f; font-style: italic; line-height: 1.5;">${taskDesc}</p>
            </div>
          </div>
          
          <!-- Action Button -->
          <div style="text-align: center; margin-bottom: 12px;">
            <a href="${appUrl}" style="display: inline-block; background-color: #1e3a8a; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 12px 32px; border-radius: 6px; box-shadow: 0 4px 6px rgba(30, 58, 138, 0.15); transition: background-color 0.15s ease;">
              View Task Dashboard
            </a>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #fcfaf8; padding: 24px; border-top: 1px solid #eadecf; text-align: center; font-size: 12.5px; color: #806c66; line-height: 1.5;">
          <p style="margin: 0 0 4px;">Sent automatically from the JPCS Treasury Portal.</p>
          <p style="margin: 0;">&copy; 2026 Junior Philippine Computer Society. All rights reserved.</p>
        </div>
      </div>
    </div>
  `;

  await sendGmailNotification(emailAddress, subject, htmlBody);
  return true;
}

