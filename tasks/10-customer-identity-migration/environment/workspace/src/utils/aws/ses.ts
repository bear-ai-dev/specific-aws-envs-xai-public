import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export const sendEmail = async (
    subject: string,
    fromName: string,
    fromEmail: string,
    toEmail: string,
    content: string,
    replyToName: string,
    replyToEmail: string
): Promise<any> => {
    const sesClient = new SESClient({ region: 'us-west-2' });
    const param = {
        ConfigurationSetName: 'defaultConfigurationSet',
        Message: {
            Body: {
                Text: {
                    Charset: 'UTF-8',
                    Data: content,
                },
            },
            Subject: {
                Charset: 'UTF-8',
                Data: subject,
            },
        },
        Destination: {
            BccAddresses: [],
            CcAddresses: [],
            ToAddresses: [toEmail],
        },
        Source: `${fromName} <${fromEmail}>`,
        ReplyToAddresses: [`${replyToName} <${replyToEmail}>`],
    };
    const command = new SendEmailCommand(param);
    const response = await sesClient.send(command);
    return response;
};
